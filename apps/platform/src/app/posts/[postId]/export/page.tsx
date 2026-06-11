import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PostExportActions } from "@/components/post-export-actions";
import {
  POST_EXPORT_WATERMARK_TEXT,
  postBodyToExportHtml,
  postDocxDownloadPath,
  postPdfDownloadPath,
  postPdfExportDocumentTitle,
} from "@/lib/post-export";
import { getPostForPdfExport } from "@/lib/post-export-server";

interface PostExportPageProps {
  params: Promise<{ postId: string }>;
}

export async function generateMetadata({
  params,
}: PostExportPageProps): Promise<Metadata> {
  const { postId } = await params;
  const post = await getPostForPdfExport(postId);

  return {
    title: post ? postPdfExportDocumentTitle(post.body) : "Document",
  };
}

export default async function PostExportPage({ params }: PostExportPageProps) {
  const { postId } = await params;
  const post = await getPostForPdfExport(postId);
  if (!post) notFound();

  const sourceHref = post.node ? `/n/${post.node.id}` : "/";
  const exportHtml = postBodyToExportHtml(post.body);

  return (
    <div className="post-export-page min-h-dvh bg-bg-secondary px-6 py-6 text-text-primary">
      <div className="post-export-screen-toolbar mx-auto mb-4 flex w-full max-w-[8.5in] items-center justify-between gap-3">
        <Link
          href={sourceHref}
          className="inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <ArrowLeft size={15} />
          Back to source
        </Link>
        <PostExportActions
          docxHref={postDocxDownloadPath(post.id)}
          pdfHref={postPdfDownloadPath(post.id)}
        />
      </div>

      <article className="post-export-paper mx-auto w-full max-w-[8.5in] rounded-lg border border-border bg-bg-card px-[0.72in] py-[0.68in] shadow-sm">
        <div className="post-export-watermark" aria-hidden="true">
          {POST_EXPORT_WATERMARK_TEXT}
        </div>
        <section
          className="post-export-body post-export-document"
          dangerouslySetInnerHTML={{ __html: exportHtml }}
        />
      </article>
    </div>
  );
}
