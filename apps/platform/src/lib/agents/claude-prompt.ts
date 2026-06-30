// Claude-specific prompt renderer. Consumes the agent-agnostic `NodeContext`
// from `node-context.ts` and produces the `{ systemPrompt, userMessage }`
// shape that `invokeClaude` expects. Keep all Claude-specific framing here:
// the "you are Claude" preamble, the chronological thread layout, the
// instruction to respond to the latest @-mention, etc.
//
// Other agents (Claude Code, Swarm, BrainShare …) get their own renderer
// files that consume the same `NodeContext` but format it however that agent
// prefers.

import type {
  MentionedNodeContext,
  NodeContext,
  RelativeThread,
} from "./node-context";
import { plainTextFromBody } from "./node-context";
import {
  extractAgentAttachmentsFromNodeContext,
  type AgentAttachment,
} from "./attachments";
import { renderAIStandardsForPrompt } from "../ai-standards";
import { selectThreadSheetForPrompt } from "../thread-context-sheet";
import type { PostRecord } from "../posts";
import {
  formatPromptTimestamp,
  formatTemporalContext,
  getElapsedGapLabel,
} from "../time";
import type { AIStandard } from "../types";

export interface ClaudePrompt {
  systemPrompt: string;
  userMessage: string;
  attachments: AgentAttachment[];
}

export interface ClaudePromptOptions {
  /**
   * The exact post that triggered this invocation. When present, the renderer
   * marks that post in the active thread so Claude does not answer a nearby
   * sibling/parent thread or an earlier @-mention.
   */
  targetPostId?: string;
  /**
   * Deterministic clock for prompt rendering. Defaults to wall-clock time.
   */
  now?: Date;
  /**
   * Effective BrainShare inborn standards for this instance. These are
   * product-level defaults plus instance overrides.
   */
  standards?: AIStandard[];
}

export function renderClaudePrompt(
  ctx: NodeContext,
  options: ClaudePromptOptions = {}
): ClaudePrompt {
  const now = options.now ?? new Date();

  return {
    systemPrompt: buildSystemPrompt(ctx, options, now),
    userMessage: buildUserMessage(ctx, options, now),
    attachments: extractAgentAttachmentsFromNodeContext(ctx, {
      targetPostId: options.targetPostId,
    }),
  };
}

/**
 * Stub prompt for the "node not found" path. Mirrors the previous behaviour
 * of `assembleNodeContext` so callers can keep treating a null gather result
 * as a soft error rather than a throw.
 */
export function renderClaudeNotFoundPrompt(): ClaudePrompt {
  return {
    systemPrompt:
      "You are Claude, a teammate in WorkOS. The node could not be found.",
    userMessage: "(no context available)",
    attachments: [],
  };
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  ctx: NodeContext,
  options: ClaudePromptOptions,
  now: Date
): string {
  const lines: Array<string | null> = [
    `You are Claude, a teammate inside WorkOS — a work management platform where humans and AI agents collaborate as peers in card and stack post threads.`,
    ``,
    formatTemporalContext(now),
    ``,
    `You have been @-mentioned in a post thread. Your job is to be useful: think with the user, draft, analyze, summarize, plan, or push back honestly. Be concise. Ground every claim in the context below; if context is missing, ask. Do not turn ambiguous strategic, creative, planning, coaching, or "thought partner" requests into a complete finished artifact unless the target post explicitly asks for that; collaborate in small steps instead. Only respond to the post explicitly marked "TARGET @MENTION TO ANSWER". Do NOT answer earlier @-mentions or adjacent parent/sibling threads unless the target post asks you to use them. Do NOT @-mention yourself or other agents in your reply. Do NOT prefix your message with "Claude:" or your name — the post is already attributed to you.`,
    ``,
    `Temporal relevance: Before using prior thread context, compare its timestamp to the current WorkOS time. Ask a brief freshness question if the answer depends on whether it is still true. Treat temporary state as stale quickly, important plans/status as possibly stale unless recent or reaffirmed, durable project facts and decisions as more stable, and the target post as the highest-priority signal for what matters now.`,
    ``,
    options.standards && options.standards.length > 0
      ? `${renderAIStandardsForPrompt(options.standards)}\n`
      : null,
    `# Node`,
    `- Type: ${ctx.node.type}`,
    `- Title: ${ctx.node.title}`,
    `- Workspace: ${ctx.workspaceTitle}`,
    `- Path: ${ctx.breadcrumb}`,
    ctx.owner ? `- Owner: ${ctx.owner.name}` : null,
    ctx.members.length > 0
      ? `- Members: ${ctx.members.map((m) => m.name).join(", ")}`
      : null,
    ``,
    ctx.fields.length > 0
      ? `# Field values\n${ctx.fields.map((f) => `- ${f.name}: ${f.rendered}`).join("\n")}\n`
      : null,
    ctx.memory.rationale ? `# Rationale (why this exists)\n${ctx.memory.rationale}\n` : null,
    ctx.memory.assumptions.length > 0
      ? `# Assumptions\n${ctx.memory.assumptions.map((a) => `- ${a.statement} (${a.status})`).join("\n")}\n`
      : null,
    ctx.memory.decisions.length > 0
      ? `# Decisions\n${ctx.memory.decisions
          .map((d) => {
            const r = d.body ? ` — ${d.body.slice(0, 200)}` : "";
            return `- ${d.statement}${r} (${d.status})`;
          })
          .join("\n")}\n`
      : null,
    ctx.links.length > 0
      ? `# Linked context\n${ctx.links
          .map((l) => `- (${l.rel}) ${l.title} [${l.type}]`)
          .join("\n")}\n`
      : null,
  ];

  return lines.filter((l): l is string => l !== null).join("\n");
}

// ---------------------------------------------------------------------------
// User message — the conversational thread + family threads
// ---------------------------------------------------------------------------

function buildUserMessage(
  ctx: NodeContext,
  options: ClaudePromptOptions,
  now: Date
): string {
  const sections: string[] = [];

  const sheetItems = selectThreadSheetForPrompt(ctx.threadContextSheet);
  if (sheetItems.length > 0) {
    sections.push(
      [
        "# Thread Context Sheet",
        "",
        ...sheetItems.map((item) => `- ${item.statement}`),
      ].join("\n")
    );
  }

  // Explicitly attached context comes before inferred family context.
  for (const attached of ctx.attachedContexts) {
    sections.push(
      renderRelativeSection(
        `# Attached context: "${attached.node.title}"`,
        attached,
        now
      )
    );
  }

  // Parent stack thread, when applicable.
  if (ctx.parentThread) {
    sections.push(
      renderRelativeSection(
        `# Stack thread (parent: "${ctx.parentThread.node.title}")`,
        ctx.parentThread,
        now
      )
    );
  }

  // Sibling card threads.
  for (const s of ctx.siblingThreads) {
    sections.push(
      renderRelativeSection(`# Sibling card: "${s.node.title}"`, s, now)
    );
  }

  // Child card threads (when @-mentioned on a stack).
  for (const c of ctx.childThreads) {
    sections.push(
      renderRelativeSection(`# Child card: "${c.node.title}"`, c, now)
    );
  }

  const mentionedNodes = ctx.mentionedNodes ?? [];
  if (mentionedNodes.length > 0 || (ctx.omittedMentionedNodeCount ?? 0) > 0) {
    sections.push(
      renderMentionedNodeSection(
        mentionedNodes,
        ctx.omittedMentionedNodeCount ?? 0,
        now
      )
    );
  }

  // Own thread (the one Claude was @-mentioned in) must come last, immediately
  // before the instruction. Related threads are useful context, but putting
  // them after the active thread made Claude sometimes answer a sibling card
  // or an earlier @-mention.
  sections.push(
    renderThreadSection(
      `# Active thread on "${ctx.node.title}"`,
      ctx.ownThread,
      options.targetPostId,
      now
    )
  );

  sections.push(
    [
      `---`,
      options.targetPostId
        ? `Respond only to the post marked "TARGET @MENTION TO ANSWER".`
        : `Respond to the most recent post in the active thread (the one that mentioned you).`,
    ].join("\n")
  );

  return sections.join("\n\n");
}

function renderThreadSection(
  heading: string,
  posts: PostRecord[],
  targetPostId: string | undefined,
  now: Date
): string {
  const lines: string[] = [heading, ``];
  lines.push(
    ...renderChronologicalPosts({
      posts,
      now,
      targetPostId,
      includeGapMarkers: true,
    })
  );
  return lines.join("\n").trimEnd();
}

function renderRelativeSection(
  heading: string,
  thread: RelativeThread,
  now: Date
): string {
  if (thread.contextPack) {
    const pack = thread.contextPack;
    return [
      heading,
      "",
      `Relevance: ${Math.round(pack.relevance_confidence * 100)}%`,
      `Why included: ${pack.reason}`,
      pack.useful_facts.length > 0
        ? `Useful facts:\n${pack.useful_facts.map((fact) => `- ${fact}`).join("\n")}`
        : null,
      pack.snippet ? `Source snippet:\n${pack.snippet}` : null,
    ]
      .filter((line): line is string => line !== null)
      .join("\n")
      .trimEnd();
  }

  const lines: string[] = [heading, ``];
  lines.push(
    ...renderChronologicalPosts({
      posts: thread.posts,
      now,
      includeGapMarkers: true,
    })
  );
  return lines.join("\n").trimEnd();
}

function renderMentionedNodeSection(
  nodes: MentionedNodeContext[],
  omittedCount: number,
  now: Date
): string {
  const lines: string[] = ["# Mentioned Node Context", ""];

  for (const item of nodes) {
    lines.push(`## ${item.mention.title} [${item.mention.type}]`);

    if (!item.found || !item.node) {
      lines.push(
        "Context unavailable; this node may have been deleted or archived."
      );
      lines.push("");
      continue;
    }

    if (item.breadcrumb) lines.push(`Path: ${item.breadcrumb}`);
    if (item.owner) lines.push(`Owner: ${item.owner.name}`);
    if (item.members.length > 0) {
      lines.push(`Members: ${item.members.map((m) => m.name).join(", ")}`);
    }

    if (item.fields.length > 0) {
      lines.push("Fields:");
      for (const field of item.fields) {
        lines.push(`- ${field.name}: ${field.rendered}`);
      }
    }

    const memoryLines = renderMentionedNodeMemory(item);
    if (memoryLines.length > 0) {
      lines.push("Memory:");
      lines.push(...memoryLines);
    }

    if (item.posts.length > 0) {
      lines.push("Recent thread:");
      lines.push(
        ...renderChronologicalPosts({
          posts: item.posts,
          now,
          includeGapMarkers: false,
        })
      );
    } else {
      lines.push("");
    }
  }

  if (omittedCount > 0) {
    lines.push(`${omittedCount} additional #node mentions omitted.`);
  }

  return lines.join("\n").trimEnd();
}

function renderMentionedNodeMemory(item: MentionedNodeContext): string[] {
  const lines: string[] = [];

  if (item.memory.rationale) {
    lines.push(`- Rationale: ${item.memory.rationale}`);
  }
  for (const assumption of item.memory.assumptions) {
    lines.push(`- Assumption: ${assumption.statement} (${assumption.status})`);
  }
  for (const decision of item.memory.decisions) {
    const body = decision.body ? ` — ${decision.body.slice(0, 200)}` : "";
    lines.push(`- Decision: ${decision.statement}${body} (${decision.status})`);
  }

  return lines;
}

function renderChronologicalPosts(input: {
  posts: PostRecord[];
  now: Date;
  targetPostId?: string;
  includeGapMarkers: boolean;
}): string[] {
  const lines: string[] = [];
  const chronological = [...input.posts].reverse();
  let previousPost: PostRecord | null = null;

  for (const post of chronological) {
    if (input.includeGapMarkers && previousPost) {
      const gapLabel = getElapsedGapLabel(
        previousPost.created_at,
        post.created_at
      );
      if (gapLabel) {
        lines.push(`--- ${gapLabel} ---`);
        lines.push("");
      }
    }

    lines.push(renderPost(post, input.now, input.targetPostId));
    lines.push("");
    previousPost = post;
  }

  return lines;
}

function renderPost(
  post: PostRecord,
  now: Date,
  targetPostId?: string
): string {
  const author = post.actor?.name ?? "Unknown";
  const when = formatPromptTimestamp(post.created_at, now);
  const marker =
    targetPostId && post.id === targetPostId
      ? `>>> TARGET @MENTION TO ANSWER <<<\n`
      : "";

  if (post.post_type === "card_created" && post.metadata) {
    const title = metadataString(post.metadata.card_title) ?? "(card)";
    return `${marker}[${author} · ${when}] (activity) created card "${title}"`;
  }
  if (post.post_type === "link_created" && post.metadata) {
    const target = metadataString(post.metadata.target_title) ?? "(node)";
    return `${marker}[${author} · ${when}] (activity) linked to "${target}"`;
  }

  const body = plainTextFromBody(post.body ?? "");
  return `${marker}[${author} · ${when}]\n${body}`;
}

function metadataString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
