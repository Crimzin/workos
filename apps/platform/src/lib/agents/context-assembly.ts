// Assembles the system prompt + user message Claude sees when @-mentioned
// inside a card or stack post thread. Reuses existing read helpers — does
// not duplicate query logic.

import { getNodeDetail } from "../node-detail";
import { getNodePosts } from "../posts";
import { getNodeLinks } from "../links";
import { getNodeMemoryPrimitives } from "../memory-primitives";
import type { PostRecord } from "../posts";

export interface AgentContext {
  systemPrompt: string;
  userMessage: string;
}

/**
 * Build the full prompt payload for an agent invocation on a node.
 * Cheap to call — all underlying reads are unstable_cache'd by tag.
 */
export async function assembleNodeContext(nodeId: string): Promise<AgentContext> {
  const [detail, posts, links, primitives] = await Promise.all([
    getNodeDetail(nodeId),
    getNodePosts(nodeId),
    getNodeLinks(nodeId),
    getNodeMemoryPrimitives(nodeId),
  ]);

  if (!detail) {
    return {
      systemPrompt: "You are Claude, a teammate in WorkOS. The node could not be found.",
      userMessage: "(no context available)",
    };
  }

  const { node, owner, members, ancestors, fields, values, mirrorPlacements } = detail;

  // ---- Path / breadcrumb ----
  const homePlacement = mirrorPlacements.find((p) => p.is_home);
  const workspaceTitle =
    homePlacement?.parent.title ??
    ancestors.find((a) => a.type === "workspace")?.title ??
    "(unknown workspace)";
  const breadcrumb =
    ancestors.length > 0
      ? ancestors.map((a) => a.title).join(" / ") + " / " + node.title
      : node.title;

  // ---- Field values ----
  const fieldLines: string[] = [];
  const valuesByField = new Map<string, typeof values>();
  for (const v of values) {
    const arr = valuesByField.get(v.field_id) ?? [];
    arr.push(v);
    valuesByField.set(v.field_id, arr);
  }
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
    if (rendered) fieldLines.push(`- ${field.name}: ${rendered}`);
  }

  // ---- Memory primitives ----
  const rationaleText = primitives.rationale
    ? plainTextFromBody(primitives.rationale.body ?? primitives.rationale.statement)
    : null;
  const assumptionLines = primitives.assumptions.map(
    (a) => `- ${a.statement} (${a.status})`
  );
  const decisionLines = primitives.decisions.map((d) => {
    const r = d.body ? ` — ${plainTextFromBody(d.body).slice(0, 200)}` : "";
    return `- ${d.statement}${r} (${d.status})`;
  });

  // ---- Linked context ----
  const linkLines: string[] = [];
  for (const l of links.related) {
    linkLines.push(`- (related) ${l.other_node.title} [${l.other_node.type}]`);
  }
  for (const l of links.blocks) {
    linkLines.push(`- (blocks) ${l.other_node.title} [${l.other_node.type}]`);
  }
  for (const l of links.blockedBy) {
    linkLines.push(`- (blocked by) ${l.other_node.title} [${l.other_node.type}]`);
  }

  // ---- System prompt ----
  const systemPrompt = [
    `You are Claude, a teammate inside WorkOS — a work management platform where humans and AI agents collaborate as peers in card and stack post threads.`,
    ``,
    `You have been @-mentioned in a post thread. Your job is to be useful: think with the user, draft, analyze, summarize, plan, or push back honestly. Be concise. Ground every claim in the context below; if context is missing, ask. Do NOT @-mention yourself or other agents in your reply. Do NOT prefix your message with "Claude:" or your name — the post is already attributed to you.`,
    ``,
    `# Node`,
    `- Type: ${node.type}`,
    `- Title: ${node.title}`,
    `- Workspace: ${workspaceTitle}`,
    `- Path: ${breadcrumb}`,
    owner ? `- Owner: ${owner.name}` : null,
    members.length > 0 ? `- Members: ${members.map((m) => m.name).join(", ")}` : null,
    ``,
    fieldLines.length > 0 ? `# Field values\n${fieldLines.join("\n")}\n` : null,
    rationaleText ? `# Rationale (why this exists)\n${rationaleText}\n` : null,
    assumptionLines.length > 0
      ? `# Assumptions\n${assumptionLines.join("\n")}\n`
      : null,
    decisionLines.length > 0 ? `# Decisions\n${decisionLines.join("\n")}\n` : null,
    linkLines.length > 0 ? `# Linked context\n${linkLines.join("\n")}\n` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // ---- User message: chronological thread ----
  const chronological = [...posts].reverse(); // posts come back newest-first
  const threadLines: string[] = [`# Thread on "${node.title}"`, ``];
  for (const p of chronological) {
    threadLines.push(renderPost(p));
    threadLines.push("");
  }
  threadLines.push(
    `---`,
    `Respond to the most recent post (the one that mentioned you).`
  );

  return {
    systemPrompt,
    userMessage: threadLines.join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPost(post: PostRecord): string {
  const author = post.actor?.name ?? "Unknown";
  const when = relativeTime(post.created_at);

  if (post.post_type === "card_created" && post.metadata) {
    const title = (post.metadata as Record<string, string>).card_title ?? "(card)";
    return `[${author} · ${when}] (activity) created card "${title}"`;
  }
  if (post.post_type === "link_created" && post.metadata) {
    const target = (post.metadata as Record<string, string>).target_title ?? "(node)";
    return `[${author} · ${when}] (activity) linked to "${target}"`;
  }

  const body = plainTextFromBody(post.body ?? "");
  return `[${author} · ${when}]\n${body}`;
}

/**
 * BlockNote body is a JSON array of blocks. Walk it and produce a plain-text
 * rendering. `@mention` inline nodes become `@Name`. Legacy plain-text bodies
 * (pre-BlockNote) are passed through unchanged.
 */
function plainTextFromBody(body: string): string {
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

function renderBlock(block: { type?: string; content?: unknown }): string {
  if (!block.content) return "";
  if (!Array.isArray(block.content)) return "";

  const parts: string[] = [];
  for (const inline of block.content as Array<Record<string, unknown>>) {
    if (inline.type === "text" && typeof inline.text === "string") {
      parts.push(inline.text);
    } else if (inline.type === "mention" && inline.props) {
      const name = (inline.props as { name?: string }).name ?? "Unknown";
      parts.push(`@${name}`);
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

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}
