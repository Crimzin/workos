import {
  docxFileNameForPostTitle,
  postPdfExportDocumentTitle,
} from "@/lib/post-export";
import { postBodyToGoogleDocsDocxBuffer } from "@/lib/post-export-docx";
import { getPostForPdfExport } from "@/lib/post-export-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PostDocxRouteContext {
  params: Promise<{ postId: string }>;
}

export async function GET(
  _request: Request,
  { params }: PostDocxRouteContext
) {
  const { postId } = await params;
  const post = await getPostForPdfExport(postId);
  if (!post) return new Response("Not found", { status: 404 });

  const title = postPdfExportDocumentTitle(post.body);
  const docx = await postBodyToGoogleDocsDocxBuffer({
    body: post.body,
    title,
  });

  return new Response(new Uint8Array(docx), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${docxFileNameForPostTitle(
        title
      )}"`,
      "Cache-Control": "no-store",
    },
  });
}
