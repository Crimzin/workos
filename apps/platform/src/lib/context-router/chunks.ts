export interface ContextChunkInsert {
  instance_id: string;
  source_node_id: string;
  source_post_id: string;
  source_message_id: string | null;
  chunk_index: number;
  text: string;
  metadata: Record<string, unknown>;
}

export function buildContextChunksForImportedPost(input: {
  instanceId: string;
  sourceNodeId: string;
  sourcePostId: string;
  sourceMessageId: string | null;
  text: string;
}): ContextChunkInsert[] {
  const maxChars = 2_400;
  const overlapChars = 240;
  const chunks: ContextChunkInsert[] = [];

  for (let start = 0, index = 0; start < input.text.length; index++) {
    const end = Math.min(input.text.length, start + maxChars);
    const text = input.text.slice(start, end).trim();

    if (text.length > 0) {
      chunks.push({
        instance_id: input.instanceId,
        source_node_id: input.sourceNodeId,
        source_post_id: input.sourcePostId,
        source_message_id: input.sourceMessageId,
        chunk_index: index,
        text,
        metadata: {},
      });
    }

    if (end >= input.text.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }

  return chunks;
}
