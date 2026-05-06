// Inserts an agent's reply as a post in the same thread, authored by the
// agent actor. Converts plain text → BlockNote JSON paragraphs.

import { supabase } from "../supabase";
import { revalidateNodePosts, revalidateWorkspaceFeed } from "../cache";
import { revalidatePath } from "next/cache";

interface BlockNoteParagraph {
  type: "paragraph";
  content: Array<{ type: "text"; text: string; styles: Record<string, never> }>;
}

/**
 * Convert plain text into a minimal BlockNote document. Each paragraph
 * (separated by blank lines) becomes a `paragraph` block; line breaks within
 * a paragraph are preserved as soft breaks via single \n inside a single
 * text node — BlockNote renders \n as visible newlines in display blocks.
 *
 * v1 plain-text only. Markdown rendering (headings, bullets, code) is a
 * v1 polished follow-up.
 */
function textToBlockNote(text: string): BlockNoteParagraph[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [{ type: "paragraph", content: [] as BlockNoteParagraph["content"] }];
  }
  // Split on blank lines → paragraph blocks. Preserve single newlines inside.
  const paragraphs = trimmed.split(/\n{2,}/);
  return paragraphs.map((p) => ({
    type: "paragraph" as const,
    content: [{ type: "text" as const, text: p, styles: {} }],
  }));
}

export async function postAgentReply(
  nodeId: string,
  workspaceId: string,
  agentActorId: string,
  text: string
): Promise<void> {
  const blocks = textToBlockNote(text);
  const body = JSON.stringify(blocks);

  const { error } = await supabase.from("posts").insert({
    node_id: nodeId,
    actor_id: agentActorId,
    post_type: "post",
    body,
  });
  if (error) throw error;

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
}
