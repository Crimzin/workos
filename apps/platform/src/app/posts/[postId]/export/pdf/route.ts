import { chromium } from "playwright-core";
import { buildPostPdfBrowserLaunchOptions } from "@/lib/post-export-browser";
import {
  pdfFileNameForPostTitle,
  postPdfExportDocumentTitle,
  postPdfExportPath,
} from "@/lib/post-export";
import { getPostForPdfExport } from "@/lib/post-export-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface PostPdfRouteContext {
  params: Promise<{ postId: string }>;
}

export async function GET(
  request: Request,
  { params }: PostPdfRouteContext
) {
  const { postId } = await params;
  const post = await getPostForPdfExport(postId);
  if (!post) return new Response("Not found", { status: 404 });

  const title = postPdfExportDocumentTitle(post.body);
  const exportUrl = new URL(postPdfExportPath(postId), request.url);
  exportUrl.searchParams.set("pdf", "1");

  const browser = await chromium.launch(
    await buildPostPdfBrowserLaunchOptions({
      playwrightExecutablePath: chromium.executablePath(),
    })
  );

  try {
    const page = await browser.newPage({
      viewport: { width: 816, height: 1056 },
    });
    await page.goto(exportUrl.toString(), {
      waitUntil: "load",
      timeout: 30_000,
    });
    await page.evaluate(() => document.fonts?.ready);

    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      displayHeaderFooter: false,
      preferCSSPageSize: true,
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
      },
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdfFileNameForPostTitle(
          title
        )}"`,
        "Cache-Control": "no-store",
      },
    });
  } finally {
    await browser.close();
  }
}
