import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canExportPostToPdf,
  docxFileNameForPostTitle,
  pdfFileNameForPostTitle,
  postBodyToExportHtml,
  postDocxDownloadPath,
  POST_EXPORT_WATERMARK_TEXT,
  postPdfDownloadPath,
  postPdfExportDocumentTitle,
  postPdfExportPath,
} from "./post-export";
import { postBodyToGoogleDocsDocxBuffer } from "./post-export-docx";

assert.equal(POST_EXPORT_WATERMARK_TEXT, "By Will Corbett via WI LLC");

assert.equal(postPdfExportPath("post-1"), "/posts/post-1/export");
assert.equal(postPdfExportPath("post/with space"), "/posts/post%2Fwith%20space/export");
assert.equal(postPdfDownloadPath("post-1"), "/posts/post-1/export/pdf");
assert.equal(postPdfDownloadPath("post/with space"), "/posts/post%2Fwith%20space/export/pdf");
assert.equal(postDocxDownloadPath("post-1"), "/posts/post-1/export/docx");
assert.equal(postDocxDownloadPath("post/with space"), "/posts/post%2Fwith%20space/export/docx");
assert.equal(
  pdfFileNameForPostTitle("Fixing What's Breaking at Saglo"),
  "fixing-whats-breaking-at-saglo.pdf"
);
assert.equal(
  docxFileNameForPostTitle("Fixing What's Breaking at Saglo"),
  "fixing-whats-breaking-at-saglo.docx"
);
assert.equal(pdfFileNameForPostTitle(""), "document.pdf");
assert.equal(docxFileNameForPostTitle(""), "document.docx");

const exportHtml = postBodyToExportHtml(
  JSON.stringify([
    {
      type: "heading",
      props: { level: 1 },
      content: [{ type: "text", text: "AI Productivity <Plan>" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Make it ", styles: {} },
        { type: "text", text: "professional", styles: { bold: true } },
        { type: "text", text: " and " },
        {
          type: "link",
          href: "https://example.com",
          content: [{ type: "text", text: "shareable" }],
        },
        { type: "mention", props: { name: "Claude" } },
      ],
    },
    { type: "bulletListItem", content: "No blank PDF shells" },
    { type: "bulletListItem", content: "No system metadata" },
  ])
);

assert.equal(
  exportHtml,
  '<h1>AI Productivity &lt;Plan&gt;</h1><p>Make it <strong>professional</strong> and <a href="https://example.com">shareable</a></p><ul><li>No blank PDF shells</li><li>No system metadata</li></ul>'
);

assert.equal(canExportPostToPdf({ post_type: "post", body: "Hello" }), true);
assert.equal(canExportPostToPdf({ post_type: "post", body: "   " }), false);
assert.equal(canExportPostToPdf({ post_type: "card_created", body: "Hello" }), false);

assert.equal(
  postPdfExportDocumentTitle(
    JSON.stringify([
      {
        type: "heading",
        content: [{ type: "text", text: "Fixing What's Breaking Saglo" }],
      },
    ])
  ),
  "Fixing What's Breaking Saglo"
);
assert.equal(
  postPdfExportDocumentTitle(
    JSON.stringify([
      {
        type: "paragraph",
        content: [{ type: "mention", props: { name: "Claude" } }],
      },
      {
        type: "paragraph",
        content: "A professional memo title",
      },
    ])
  ),
  "A professional memo title"
);
assert.equal(postPdfExportDocumentTitle(""), "Document");

void (async () => {
  const docxBuffer = await postBodyToGoogleDocsDocxBuffer({
    body: JSON.stringify([
      {
        type: "heading",
        props: { level: 1 },
        content: [{ type: "text", text: "Editable Google Doc" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Keep ", styles: {} },
          { type: "text", text: "real text", styles: { bold: true } },
          { type: "text", text: " editable." },
        ],
      },
      { type: "bulletListItem", content: "Imported lists stay editable" },
      { type: "numberedListItem", content: "Numbered lists too" },
    ]),
    title: "Editable Google Doc",
  });

  const docxXml = docxBuffer.toString("latin1");
  assert.match(docxXml, /word\/document\.xml/);
  assert.ok(docxBuffer.byteLength > 1_000);
})();

const postExportCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

assert.match(
  postExportCss,
  /\.post-export-document h1:not\(:first-child\)[\s\S]*?margin-top: 2\.75rem;/,
  "non-initial export H1s need generous screen spacing above them"
);
assert.match(
  postExportCss,
  /\.post-export-document h1:not\(:first-child\)[\s\S]*?margin-top: 0\.52in;/,
  "non-initial export H1s need generous print spacing above them"
);
