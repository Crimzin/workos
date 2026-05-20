// Claude-specific prompt renderer. Consumes the agent-agnostic `NodeContext`
// from `node-context.ts` and produces the `{ systemPrompt, userMessage }`
// shape that `invokeClaude` expects. Keep all Claude-specific framing here:
// the "you are Claude" preamble, the chronological thread layout, the
// instruction to respond to the latest @-mention, etc.
//
// Other agents (Claude Code, Swarm, BrainShare …) get their own renderer
// files that consume the same `NodeContext` but format it however that agent
// prefers.

import type { NodeContext, RelativeThread } from "./node-context";
import { plainTextFromBody } from "./node-context";
import type { PostRecord } from "../posts";

export interface ClaudePrompt {
  systemPrompt: string;
  userMessage: string;
}

export interface ClaudePromptOptions {
  /**
   * The exact post that triggered this invocation. When present, the renderer
   * marks that post in the active thread so Claude does not answer a nearby
   * sibling/parent thread or an earlier @-mention.
   */
  targetPostId?: string;
}

export function renderClaudePrompt(
  ctx: NodeContext,
  options: ClaudePromptOptions = {}
): ClaudePrompt {
  return {
    systemPrompt: buildSystemPrompt(ctx),
    userMessage: buildUserMessage(ctx, options),
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
  };
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(ctx: NodeContext): string {
  const lines: Array<string | null> = [
    `You are Claude, a teammate inside WorkOS — a work management platform where humans and AI agents collaborate as peers in card and stack post threads.`,
    ``,
    `You have been @-mentioned in a post thread. Your job is to be useful: think with the user, draft, analyze, summarize, plan, or push back honestly. Be concise. Ground every claim in the context below; if context is missing, ask. Only respond to the post explicitly marked "TARGET @MENTION TO ANSWER". Do NOT answer earlier @-mentions or adjacent parent/sibling threads unless the target post asks you to use them. Do NOT @-mention yourself or other agents in your reply. Do NOT prefix your message with "Claude:" or your name — the post is already attributed to you.`,
    ``,
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

function buildUserMessage(ctx: NodeContext, options: ClaudePromptOptions): string {
  const sections: string[] = [];

  // Parent stack thread, when applicable.
  if (ctx.parentThread) {
    sections.push(
      renderRelativeSection(
        `# Stack thread (parent: "${ctx.parentThread.node.title}")`,
        ctx.parentThread
      )
    );
  }

  // Sibling card threads.
  for (const s of ctx.siblingThreads) {
    sections.push(renderRelativeSection(`# Sibling card: "${s.node.title}"`, s));
  }

  // Child card threads (when @-mentioned on a stack).
  for (const c of ctx.childThreads) {
    sections.push(renderRelativeSection(`# Child card: "${c.node.title}"`, c));
  }

  // Own thread (the one Claude was @-mentioned in) must come last, immediately
  // before the instruction. Related threads are useful context, but putting
  // them after the active thread made Claude sometimes answer a sibling card
  // or an earlier @-mention.
  sections.push(
    renderThreadSection(
      `# Active thread on "${ctx.node.title}"`,
      ctx.ownThread,
      options.targetPostId
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
  targetPostId?: string
): string {
  const lines: string[] = [heading, ``];
  // newest-first → chronological
  const chronological = [...posts].reverse();
  for (const p of chronological) {
    lines.push(renderPost(p, targetPostId));
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function renderRelativeSection(heading: string, thread: RelativeThread): string {
  const lines: string[] = [heading, ``];
  const chronological = [...thread.posts].reverse();
  for (const p of chronological) {
    lines.push(renderPost(p));
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function renderPost(post: PostRecord, targetPostId?: string): string {
  const author = post.actor?.name ?? "Unknown";
  const when = relativeTime(post.created_at);
  const marker =
    targetPostId && post.id === targetPostId
      ? `>>> TARGET @MENTION TO ANSWER <<<\n`
      : "";

  if (post.post_type === "card_created" && post.metadata) {
    const title = (post.metadata as Record<string, string>).card_title ?? "(card)";
    return `${marker}[${author} · ${when}] (activity) created card "${title}"`;
  }
  if (post.post_type === "link_created" && post.metadata) {
    const target = (post.metadata as Record<string, string>).target_title ?? "(node)";
    return `${marker}[${author} · ${when}] (activity) linked to "${target}"`;
  }

  const body = plainTextFromBody(post.body ?? "");
  return `${marker}[${author} · ${when}]\n${body}`;
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
