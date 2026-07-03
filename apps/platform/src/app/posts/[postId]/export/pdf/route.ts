import {
  pdfFileNameForPostTitle,
  postPdfExportDocumentTitle,
} from "@/lib/post-export";
import { postBodyToPdfBuffer } from "@/lib/post-export-pdf";
import { getPostForPdfExport } from "@/lib/post-export-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface PostPdfRouteContext {
  params: Promise<{ postId: string }>;
}

export async function GET(
  _request: Request,
  { params }: PostPdfRouteContext
) {
  const { postId } = await params;
  const post = await getPostForPdfExport(postId);
  if (!post) return new Response("Not found", { status: 404 });

  const title = postPdfExportDocumentTitle(post.body);
  const pdf = await postBodyToPdfBuffer({ body: post.body, title });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFileNameForPostTitle(
        title
      )}"`,
      "Cache-Control": "no-store",
    },
  });
}
