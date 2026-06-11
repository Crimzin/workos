// Agent-agnostic context layer. Any agent that wants to reason about a WorkOS
// node — Claude (1.11), Claude Code, Swarm, BrainShare — calls
// `gatherNodeContext(nodeId)` and gets a single structured `NodeContext`
// blob back. Per-agent prompt rendering lives in sibling files
// (`claude-prompt.ts`, future `claude-code-prompt.ts`, etc.) so the data
// fetch stays in one place and stays consistent across agents.
//
// What's included beyond the @-mentioned node itself:
//   - Parent stack's post thread, when @-mentioned on a card under a stack.
//     Captures stack-level context (e.g. an email chain pasted to the
//     stack).
//   - Sibling cards' threads, for the same parent stack. Surfaces team-room
//     conversation across the cards in a stack.
//   - Child cards' threads, when the @-mentioned node is itself a stack.
//     Lets an agent summarise / reason over the cards inside.
//
// Per-source caps keep the payload bounded:
//   * Parent thread:    last 30 posts
//   * Sibling threads:  last 10 posts each, empty siblings dropped
//   * Child threads:    last 10 posts each, empty children dropped
//   * Hard cap of 15 sibling/child threads, taken in `position` order
//
// All reads reuse existing cached helpers (no new Supabase queries):
//   getNodeDetail, getNodePosts, getNodeLinks, getNodeMemoryPrimitives,
//   getChildren.

import type {
  DetailField,
  DetailFieldValue,
  NodeAncestor,
} from "../node-detail";
import { getNodeDetail } from "../node-detail";
import { getNodePosts } from "../posts";
import type { PostRecord } from "../posts";
import { getNodeLinks } from "../links";
import { getNodeMemoryPrimitives } from "../memory-primitives";
import { getChildren } from "../nodes";
import type { Actor, MemoryPrimitive, WorkNode } from "../types";
import {
  findNodeMentions,
  limitNodeMentions,
  MENTIONED_NODE_POST_LIMIT,
  type NodeMentionRef,
} from "../node-mentions";

const PARENT_POST_LIMIT = 30;
const RELATIVE_POST_LIMIT = 10; // per sibling / per child
const RELATIVE_THREAD_LIMIT = 15; // total siblings + children

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RelativeThread {
  node: { id: string; title: string; type: string };
  /** Posts on the relative node, newest-first (renderer reverses if it wants chronological). */
  posts: PostRecord[];
}

export interface NodeContextLink {
  rel: "related" | "blocks" | "blockedBy";
  title: string;
  type: string;
}

export interface NodeContextField {
  /** Display name of the field. */
  name: string;
  /** Pre-collapsed display string, e.g. "P2" or "Backlog, Ready". Empty string filtered out. */
  rendered: string;
}

export interface NodeContextMemory {
  rationale: string | null; // plain-text body of the rationale primitive (BlockNote→text)
  assumptions: Array<{ statement: string; status: string }>;
  decisions: Array<{ statement: string; body: string | null; status: string }>;
}

export interface MentionedNodeContext {
  mention: NodeMentionRef;
  found: boolean;
  node: {
    id: string;
    type: string;
    title: string;
  } | null;
  workspaceTitle: string | null;
  breadcrumb: string | null;
  owner: Pick<Actor, "id" | "name" | "kind"> | null;
  members: Array<Pick<Actor, "id" | "name" | "kind">>;
  fields: NodeContextField[];
  memory: NodeContextMemory;
  posts: PostRecord[];
}

export interface NodeContext {
  // Identity
  node: {
    id: string;
    type: string;
    title: string;
    description: string | null;
  };
  workspaceTitle: string;
  /** "Workspace / Stack / Card" or just node title at the root. */
  breadcrumb: string;
  owner: Pick<Actor, "id" | "name" | "kind"> | null;
  members: Array<Pick<Actor, "id" | "name" | "kind">>;

  // Display-rendered fields & values
  fields: NodeContextField[];

  // Memory primitives (rationale / assumptions / decisions)
  memory: NodeContextMemory;

  // The thread Claude was @-mentioned in, full
  ownThread: PostRecord[];

  // Family threads — empty arrays / nulls when not applicable
  parentThread: RelativeThread | null;
  siblingThreads: RelativeThread[];
  childThreads: RelativeThread[];

  // Linked nodes (titles only, no posts)
  links: NodeContextLink[];

  // Explicit #node mentions from the target post.
  mentionedNodes?: MentionedNodeContext[];
  omittedMentionedNodeCount?: number;
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

/**
 * Fetch every piece of WorkOS context an agent might need to reason about
 * `nodeId`. Returns a single uniform `NodeContext` shape that's agent-agnostic
 * — per-agent renderers (Claude, Claude Code, Swarm, …) consume this same
 * shape and format it for their own prompt conventions.
 *
 * Returns `null` only when the node itself does not exist; callers should
 * fall back to a stub prompt. Otherwise always returns a populated context
 * with empty arrays for absent sections.
 */
export async function gatherNodeContext(
  nodeId: string
): Promise<NodeContext | null> {
  const detail = await getNodeDetail(nodeId);
  if (!detail) return null;

  const {
    node,
    owner,
    members,
    ancestors,
    fields,
    values,
    children,
    mirrorPlacements,
  } = detail;

  // -------------------------------------------------------------------------
  // Decide which family threads to fetch
  // -------------------------------------------------------------------------
  // A "stack parent" exists when this card sits under a stack. We use the
  // ancestors list (already loaded) to look up the parent's type without an
  // extra fetch.
  const parentId = node.parent_id;
  const parentAncestor = parentId
    ? ancestors.find((a) => a.id === parentId)
    : null;
  const parentIsStack = parentAncestor?.type === "stack";

  // Sibling cards: only meaningful when this node is itself a card under a
  // stack. We fetch siblings via getChildren(parentId) and exclude `nodeId`.
  let siblingNodes: WorkNode[] = [];
  if (parentIsStack && parentId) {
    const allUnderParent = await getChildren(parentId);
    siblingNodes = allUnderParent
      .filter((c) => c.id !== nodeId)
      .slice(0, RELATIVE_THREAD_LIMIT);
  }

  // Child cards: only when this node IS a stack. `detail.children` already
  // holds direct children (stacks fetch this in `getNodeDetail`).
  let childNodes: WorkNode[] = [];
  if (node.type === "stack") {
    childNodes = children.slice(0, RELATIVE_THREAD_LIMIT);
  }

  // Combined cap across siblings + children so we don't double-pull on a
  // hypothetical stack that's also someone's sibling. (Today the data model
  // makes this impossible — a node is either a card OR a stack — but
  // defending now is cheap.)
  const totalRelatives = siblingNodes.length + childNodes.length;
  if (totalRelatives > RELATIVE_THREAD_LIMIT) {
    const overshoot = totalRelatives - RELATIVE_THREAD_LIMIT;
    if (childNodes.length > 0) {
      childNodes = childNodes.slice(
        0,
        Math.max(0, childNodes.length - overshoot)
      );
    } else {
      siblingNodes = siblingNodes.slice(
        0,
        Math.max(0, siblingNodes.length - overshoot)
      );
    }
  }

  // -------------------------------------------------------------------------
  // Fan-out reads
  // -------------------------------------------------------------------------
  const [
    ownPosts,
    parentPosts,
    siblingPostsArr,
    childPostsArr,
    links,
    memory,
  ] = await Promise.all([
    getNodePosts(nodeId),
    parentIsStack && parentId
      ? getNodePosts(parentId)
      : Promise.resolve([] as PostRecord[]),
    Promise.all(siblingNodes.map((s) => getNodePosts(s.id))),
    Promise.all(childNodes.map((c) => getNodePosts(c.id))),
    getNodeLinks(nodeId),
    getNodeMemoryPrimitives(nodeId),
  ]);

  // -------------------------------------------------------------------------
  // Build sibling / child threads, dropping empty ones to avoid noise
  // -------------------------------------------------------------------------
  const siblingThreads: RelativeThread[] = [];
  for (let i = 0; i < siblingNodes.length; i++) {
    const posts = siblingPostsArr[i].slice(0, RELATIVE_POST_LIMIT);
    if (posts.length === 0) continue;
    const s = siblingNodes[i];
    siblingThreads.push({
      node: { id: s.id, title: s.title, type: s.type },
      posts,
    });
  }

  const childThreads: RelativeThread[] = [];
  for (let i = 0; i < childNodes.length; i++) {
    const posts = childPostsArr[i].slice(0, RELATIVE_POST_LIMIT);
    if (posts.length === 0) continue;
    const c = childNodes[i];
    childThreads.push({
      node: { id: c.id, title: c.title, type: c.type },
      posts,
    });
  }

  // -------------------------------------------------------------------------
  // Workspace title + breadcrumb (logic preserved from old assembleNodeContext)
  // -------------------------------------------------------------------------
  const homePlacement = mirrorPlacements.find((p) => p.is_home);
  const workspaceTitle =
    homePlacement?.parent.title ??
    ancestors.find((a) => a.type === "workspace")?.title ??
    "(unknown workspace)";
  const breadcrumb =
    ancestors.length > 0
      ? ancestors.map((a) => a.title).join(" / ") + " / " + node.title
      : node.title;

  // -------------------------------------------------------------------------
  // Field display values
  // -------------------------------------------------------------------------
  const renderedFields = renderFieldsForContext(fields, values);

  // -------------------------------------------------------------------------
  // Memory primitives (collapsed to display strings)
  // -------------------------------------------------------------------------
  const memoryShape: NodeContextMemory = {
    rationale: memory.rationale
      ? plainTextFromBody(
          memory.rationale.body ?? memory.rationale.statement
        )
      : null,
    assumptions: memory.assumptions.map((a: MemoryPrimitive) => ({
      statement: a.statement,
      status: a.status,
    })),
    decisions: memory.decisions.map((d: MemoryPrimitive) => ({
      statement: d.statement,
      body: d.body ? plainTextFromBody(d.body) : null,
      status: d.status,
    })),
  };

  // -------------------------------------------------------------------------
  // Linked nodes (titles only)
  // -------------------------------------------------------------------------
  const linkRows: NodeContextLink[] = [];
  for (const l of links.related) {
    linkRows.push({
      rel: "related",
      title: l.other_node.title,
      type: l.other_node.type,
    });
  }
  for (const l of links.blocks) {
    linkRows.push({
      rel: "blocks",
      title: l.other_node.title,
      type: l.other_node.type,
    });
  }
  for (const l of links.blockedBy) {
    linkRows.push({
      rel: "blockedBy",
      title: l.other_node.title,
      type: l.other_node.type,
    });
  }

  // -------------------------------------------------------------------------
  // Parent thread (slice to recency cap)
  // -------------------------------------------------------------------------
  let parentThread: RelativeThread | null = null;
  if (parentIsStack && parentId && parentPosts.length > 0) {
    parentThread = {
      node: {
        id: parentId,
        title: parentAncestor?.title ?? "(stack)",
        type: parentAncestor?.type ?? "stack",
      },
      posts: parentPosts.slice(0, PARENT_POST_LIMIT),
    };
  }

  return {
    node: {
      id: node.id,
      type: node.type,
      title: node.title,
      description: node.description,
    },
    workspaceTitle,
    breadcrumb,
    owner: owner ?? null,
    members,
    fields: renderedFields,
    memory: memoryShape,
    ownThread: ownPosts,
    parentThread,
    siblingThreads,
    childThreads,
    links: linkRows,
  };
}

export async function gatherMentionedNodeContextsFromBody(
  body: string | null | undefined
): Promise<{
  mentionedNodes: MentionedNodeContext[];
  omittedMentionedNodeCount: number;
}> {
  const { included, omittedCount } = limitNodeMentions(findNodeMentions(body));
  const mentionedNodes = await Promise.all(
    included.map((mention) => gatherMentionedNodeContext(mention))
  );

  return {
    mentionedNodes,
    omittedMentionedNodeCount: omittedCount,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function gatherMentionedNodeContext(
  mention: NodeMentionRef
): Promise<MentionedNodeContext> {
  const detail = await getNodeDetail(mention.id);
  if (!detail || detail.node.archived_at) {
    return missingMentionedNodeContext(mention);
  }

  const [posts, memory] = await Promise.all([
    getNodePosts(mention.id),
    getNodeMemoryPrimitives(mention.id),
  ]);

  return {
    mention,
    found: true,
    node: {
      id: detail.node.id,
      type: detail.node.type,
      title: detail.node.title,
    },
    workspaceTitle: workspaceTitleForDetail(detail),
    breadcrumb: breadcrumbForDetail(detail),
    owner: detail.owner ?? null,
    members: detail.members,
    fields: renderFieldsForContext(detail.fields, detail.values),
    memory: memoryToContextShape(memory),
    posts: posts.slice(0, MENTIONED_NODE_POST_LIMIT),
  };
}

function missingMentionedNodeContext(
  mention: NodeMentionRef
): MentionedNodeContext {
  return {
    mention,
    found: false,
    node: null,
    workspaceTitle: null,
    breadcrumb: null,
    owner: null,
    members: [],
    fields: [],
    memory: emptyMemoryShape(),
    posts: [],
  };
}

function memoryToContextShape(memory: {
  rationale: MemoryPrimitive | null;
  assumptions: MemoryPrimitive[];
  decisions: MemoryPrimitive[];
}): NodeContextMemory {
  return {
    rationale: memory.rationale
      ? plainTextFromBody(memory.rationale.body ?? memory.rationale.statement)
      : null,
    assumptions: memory.assumptions.map((a: MemoryPrimitive) => ({
      statement: a.statement,
      status: a.status,
    })),
    decisions: memory.decisions.map((d: MemoryPrimitive) => ({
      statement: d.statement,
      body: d.body ? plainTextFromBody(d.body) : null,
      status: d.status,
    })),
  };
}

function emptyMemoryShape(): NodeContextMemory {
  return {
    rationale: null,
    assumptions: [],
    decisions: [],
  };
}

function workspaceTitleForDetail(
  detail: NonNullable<Awaited<ReturnType<typeof getNodeDetail>>>
): string {
  const homePlacement = detail.mirrorPlacements.find((p) => p.is_home);
  return (
    homePlacement?.parent.title ??
    detail.ancestors.find((a) => a.type === "workspace")?.title ??
    "(unknown workspace)"
  );
}

function breadcrumbForDetail(
  detail: NonNullable<Awaited<ReturnType<typeof getNodeDetail>>>
): string {
  return detail.ancestors.length > 0
    ? detail.ancestors.map((a) => a.title).join(" / ") +
        " / " +
        detail.node.title
    : detail.node.title;
}

/**
 * Collapse multi-valued fields down to "Field name: value, value" lines for
 * display. Mirrors the rendering logic that used to live in the prompt
 * builder so any agent renderer gets the same shape.
 */
function renderFieldsForContext(
  fields: DetailField[],
  values: DetailFieldValue[]
): NodeContextField[] {
  const valuesByField = new Map<string, DetailFieldValue[]>();
  for (const v of values) {
    const arr = valuesByField.get(v.field_id) ?? [];
    arr.push(v);
    valuesByField.set(v.field_id, arr);
  }
  const out: NodeContextField[] = [];
  for (const field of fields) {
    const vals = valuesByField.get(field.id) ?? [];
    if (vals.length === 0) continue;
    const rendered = vals
      .map((v) => {
        if (v.option_id) {
          const opt = field.options.find((o) => o.id === v.option_id);
          return opt?.name ?? "(unknown option)";
        }
        return v.value_text ?? v.value_date ?? "";
      })
      .filter(Boolean)
      .join(", ");
    if (rendered) out.push({ name: field.name, rendered });
  }
  return out;
}

/**
 * BlockNote body is a JSON array of blocks. Walk it and produce a plain-text
 * rendering. `@mention` inline nodes become `@Name`. Legacy plain-text
 * (pre-BlockNote) bodies are passed through unchanged.
 *
 * Exported so per-agent renderers (which need to walk post bodies the same
 * way) don't each reimplement it.
 */
export function plainTextFromBody(body: string): string {
  if (!body) return "";
  let doc: unknown;
  try {
    doc = JSON.parse(body);
  } catch {
    return body; // legacy plain text
  }
  if (!Array.isArray(doc)) return body;

  const lines: string[] = [];
  for (const block of doc as Array<{ type?: string; content?: unknown }>) {
    lines.push(renderBlock(block));
  }
  return lines.join("\n").trim();
}

function renderBlock(block: {
  type?: string;
  content?: unknown;
  props?: unknown;
}): string {
  if (block.type === "image") return renderImageBlock(block);
  if (!block.content) return "";
  if (!Array.isArray(block.content)) return "";

  const parts: string[] = [];
  for (const inline of block.content as Array<Record<string, unknown>>) {
    if (inline.type === "text" && typeof inline.text === "string") {
      parts.push(inline.text);
    } else if (inline.type === "mention" && inline.props) {
      const name = (inline.props as { name?: string }).name ?? "Unknown";
      parts.push(`@${name}`);
    } else if (inline.type === "nodeMention" && inline.props) {
      const title = (inline.props as { title?: string }).title ?? "Unknown";
      parts.push(`#${title}`);
    } else if (inline.type === "link" && Array.isArray(inline.content)) {
      for (const child of inline.content as Array<Record<string, unknown>>) {
        if (child.type === "text" && typeof child.text === "string") {
          parts.push(child.text);
        }
      }
    }
  }
  const joined = parts.join("");

  // Block-type prefixes for readability
  if (block.type === "heading") return `# ${joined}`;
  if (block.type === "bulletListItem") return `- ${joined}`;
  if (block.type === "numberedListItem") return `1. ${joined}`;
  if (block.type === "checkListItem") return `[ ] ${joined}`;
  if (block.type === "quote") return `> ${joined}`;
  if (block.type === "codeBlock") return "```\n" + joined + "\n```";
  return joined;
}

function renderImageBlock(block: { props?: unknown }): string {
  const props =
    typeof block.props === "object" && block.props !== null
      ? (block.props as Record<string, unknown>)
      : {};
  const url = stringProp(props, "url") ?? stringProp(props, "src");
  const label =
    stringProp(props, "caption") ??
    stringProp(props, "alt") ??
    stringProp(props, "altText") ??
    stringProp(props, "name") ??
    "image";

  return url ? `[Image: ${label} (${url})]` : `[Image: ${label}]`;
}

function stringProp(
  props: Record<string, unknown>,
  key: string
): string | undefined {
  const value = props[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Helpful re-exports for renderers / debug routes that don't want to know
 * about `node-detail` directly.
 */
export type { NodeAncestor };
