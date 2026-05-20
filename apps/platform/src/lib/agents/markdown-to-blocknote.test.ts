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
