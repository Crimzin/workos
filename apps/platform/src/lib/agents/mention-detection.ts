// Detects @mention inline content nodes inside a BlockNote post body and
// returns the agent actors that were tagged. Used by createPost to decide
// whether to invoke an inline AI reply.

interface MentionInline {
  type: "mention";
  props: { id: string; name: string; kind: "human" | "agent" };
}

interface BlockNodeShape {
  type?: string;
  content?: unknown;
  children?: unknown;
}

export interface MentionedAgent {
  id: string;
  name: string;
}

/**
 * Walk a BlockNote document JSON string and return every distinct @mention
 * pointing to an actor with `kind === "agent"`. Order-preserving, deduped by id.
 *
 * Legacy plain-text post bodies (pre-BlockNote) are not JSON; we return [] for
 * those silently.
 */
export function findAgentMentions(bodyJson: string): MentionedAgent[] {
  let doc: unknown;
  try {
    doc = JSON.parse(bodyJson);
  } catch {
    return [];
  }
  if (!Array.isArray(doc)) return [];

  const found = new Map<string, MentionedAgent>();
  for (const block of doc as BlockNodeShape[]) {
    walkBlock(block, found);
  }
  return [...found.values()];
}

function walkBlock(block: BlockNodeShape | unknown, out: Map<string, MentionedAgent>): void {
  if (!block || typeof block !== "object") return;
  const b = block as BlockNodeShape;

  // Inline content array on this block.
  if (Array.isArray(b.content)) {
    for (const inline of b.content) {
      if (isMentionInline(inline)) {
        const { id, name, kind } = inline.props;
        if (kind === "agent" && id && !out.has(id)) {
          out.set(id, { id, name: name ?? "Unknown" });
        }
      }
    }
  }

  // Nested children (BlockNote allows nested blocks inside blocks).
  if (Array.isArray(b.children)) {
    for (const child of b.children) {
      walkBlock(child, out);
    }
  }
}

function isMentionInline(inline: unknown): inline is MentionInline {
  if (!inline || typeof inline !== "object") return false;
  const i = inline as { type?: unknown; props?: unknown };
  if (i.type !== "mention") return false;
  if (!i.props || typeof i.props !== "object") return false;
  const p = i.props as { id?: unknown; name?: unknown; kind?: unknown };
  return typeof p.id === "string" && (p.kind === "agent" || p.kind === "human");
}
