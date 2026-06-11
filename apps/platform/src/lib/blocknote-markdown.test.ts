import assert from "node:assert/strict";
import { postBodyToMarkdown } from "./blocknote-markdown";

const body = JSON.stringify([
  {
    type: "heading",
    props: { level: 2 },
    content: [{ type: "text", text: "Plan", styles: { bold: true } }],
  },
  {
    type: "paragraph",
    content: [
      { type: "text", text: "Read ", styles: {} },
      {
        type: "link",
        href: "https://example.com",
        content: [{ type: "text", text: "the spec", styles: { italic: true } }],
      },
      { type: "text", text: " with ", styles: {} },
      { type: "mention", props: { name: "Claude" } },
      { type: "text", text: ".", styles: {} },
    ],
  },
  {
    type: "bulletListItem",
    content: [{ type: "text", text: "Ship it", styles: { code: true } }],
  },
]);

assert.equal(
  postBodyToMarkdown(body),
  "## **Plan**\n\nRead [*the spec*](https://example.com) with @Claude.\n\n- `Ship it`"
);

assert.equal(
  postBodyToMarkdown(JSON.stringify(body)),
  "## **Plan**\n\nRead [*the spec*](https://example.com) with @Claude.\n\n- `Ship it`"
);

assert.equal(
  postBodyToMarkdown(JSON.stringify({ blocks: JSON.parse(body) })),
  "## **Plan**\n\nRead [*the spec*](https://example.com) with @Claude.\n\n- `Ship it`"
);

assert.equal(
  postBodyToMarkdown(JSON.stringify([
    {
      type: "table",
      content: {
        type: "tableContent",
        rows: [
          { cells: ["Item", "Status"] },
          { cells: ["Alpha", "Done"] },
        ],
      },
    },
  ])),
  "| Item | Status |\n| --- | --- |\n| Alpha | Done |"
);

assert.equal(
  postBodyToMarkdown(
    JSON.stringify([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Use ", styles: {} },
          {
            type: "nodeMention",
            props: { title: "Pricing rewrite" },
          },
          { type: "text", text: " here.", styles: {} },
        ],
      },
    ])
  ),
  "Use #Pricing rewrite here."
);

assert.equal(postBodyToMarkdown("legacy **markdown**"), "legacy **markdown**");
assert.equal(postBodyToMarkdown(null), "");
