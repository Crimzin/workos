import assert from "node:assert/strict";
import { markdownToBlockNote } from "./markdown-to-blocknote";

const blocks = markdownToBlockNote([
  "| Item | Status |",
  "| --- | --- |",
  "| Alpha | Done |",
  "| Beta | Next |",
].join("\n"));

assert.equal(blocks.length, 1);
assert.equal(blocks[0].type, "table");
assert.deepEqual(blocks[0].content, {
  type: "tableContent",
  rows: [
    {
      cells: [
        { type: "tableCell", content: [{ type: "text", text: "Item", styles: {} }] },
        { type: "tableCell", content: [{ type: "text", text: "Status", styles: {} }] },
      ],
    },
    {
      cells: [
        { type: "tableCell", content: [{ type: "text", text: "Alpha", styles: {} }] },
        { type: "tableCell", content: [{ type: "text", text: "Done", styles: {} }] },
      ],
    },
    {
      cells: [
        { type: "tableCell", content: [{ type: "text", text: "Beta", styles: {} }] },
        { type: "tableCell", content: [{ type: "text", text: "Next", styles: {} }] },
      ],
    },
  ],
});

const richTableBlocks = markdownToBlockNote([
  "| Activity | Outcome |",
  "| --- | --- |",
  "| • **Name** reality<br>• _Discuss_ blockers<br/>• `Ship` [notes](https://example.com) | Clear plan |",
].join("\n"));

assert.equal(richTableBlocks.length, 1);
assert.deepEqual(richTableBlocks[0].content, {
  type: "tableContent",
  rows: [
    {
      cells: [
        { type: "tableCell", content: [{ type: "text", text: "Activity", styles: {} }] },
        { type: "tableCell", content: [{ type: "text", text: "Outcome", styles: {} }] },
      ],
    },
    {
      cells: [
        {
          type: "tableCell",
          content: [
            { type: "text", text: "• ", styles: {} },
            { type: "text", text: "Name", styles: { bold: true } },
            { type: "text", text: " reality\n• ", styles: {} },
            { type: "text", text: "Discuss", styles: { italic: true } },
            { type: "text", text: " blockers\n• ", styles: {} },
            { type: "text", text: "Ship", styles: { code: true } },
            { type: "text", text: " ", styles: {} },
            {
              type: "link",
              href: "https://example.com",
              content: [{ type: "text", text: "notes", styles: {} }],
            },
          ],
        },
        { type: "tableCell", content: [{ type: "text", text: "Clear plan", styles: {} }] },
      ],
    },
  ],
});
