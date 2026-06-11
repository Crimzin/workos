import { canExportPostToPdf } from "./post-export";
import type { PostRecord } from "./posts";
import { supabase } from "./supabase";

export interface PostPdfExportRecord extends PostRecord {
  node: { id: string; title: string; type: string } | null;
}

export async function getPostForPdfExport(
  postId: string
): Promise<PostPdfExportRecord | null> {
  const { data, error } = await supabase
    .from("posts")
    .select("*, actor:actors(id,name,kind), node:nodes!posts_node_id_fkey(id,title,type)")
    .eq("id", postId)
    .maybeSingle();

  if (error) throw error;
  if (!data || !canExportPostToPdf(data)) return null;

  return data as PostPdfExportRecord;
}
