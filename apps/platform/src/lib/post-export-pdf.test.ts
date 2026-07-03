import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { postBodyToPdfBuffer } from "./post-export-pdf.ts";

void (async () => {
  const pdf = await postBodyToPdfBuffer({
    title: "Reliable PDF Export",
    body: JSON.stringify([
      {
        type: "heading",
        props: { level: 1 },
        content: [{ type: "text", text: "Reliable PDF Export" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "This should render without " },
          { type: "text", text: "Chromium", styles: { bold: true } },
          { type: "text", text: "." },
        ],
      },
      { type: "bulletListItem", content: "No browser process" },
      { type: "numberedListItem", content: "No serverless binary extraction" },
    ]),
  });

  const pdfContent = inflatedPdfStreams(pdf);

  assert.ok(
    pdf.toString("latin1").startsWith("%PDF-"),
    "export should be a PDF document"
  );
  assert.ok(pdf.byteLength > 1_000, "export should contain rendered content");
  assert.match(pdfContent, /52656C6961626C6520504446204578706F7274/i);
  assert.match(pdfContent, /4E6F2062726F777365722070726F63657373/i);
})();

function inflatedPdfStreams(pdf: Buffer): string {
  const source = pdf.toString("latin1");
  const streams = source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g);

  return Array.from(streams, (match) => {
    const stream = Buffer.from(match[1], "latin1");
    try {
      return inflateSync(stream).toString("latin1");
    } catch {
      return match[1];
    }
  }).join("\n");
}
