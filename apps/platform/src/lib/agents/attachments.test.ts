import assert from "node:assert/strict";
import {
  extractAgentAttachmentsFromBody,
  renderAttachmentReferencesForTextOnlyAgent,
} from "./attachments.ts";

const body = JSON.stringify([
  {
    type: "paragraph",
    content: [{ type: "text", text: "Here is the screenshot.", styles: {} }],
  },
  {
    type: "image",
    props: {
      url: "https://example.com/screenshot.png",
      caption: "Dashboard error state",
      name: "screenshot.png",
    },
  },
  {
    type: "paragraph",
    children: [
      {
        type: "image",
        props: {
          url: "https://example.com/nested.webp",
          caption: "Nested reference",
        },
      },
    ],
  },
]);

const attachments = extractAgentAttachmentsFromBody(body, {
  postId: "post-1",
  section: "Active thread",
  authorName: "Will",
});

assert.deepEqual(attachments, [
  {
    kind: "image",
    url: "https://example.com/screenshot.png",
    title: "screenshot.png",
    caption: "Dashboard error state",
    source: {
      postId: "post-1",
      section: "Active thread",
      authorName: "Will",
    },
  },
  {
    kind: "image",
    url: "https://example.com/nested.webp",
    caption: "Nested reference",
    source: {
      postId: "post-1",
      section: "Active thread",
      authorName: "Will",
    },
  },
]);

assert.deepEqual(
  extractAgentAttachmentsFromBody("legacy plain text", {
    postId: "post-2",
    section: "Active thread",
  }),
  []
);

assert.equal(
  renderAttachmentReferencesForTextOnlyAgent(attachments),
  [
    "Attached images:",
    "- Active thread, Will: screenshot.png — Dashboard error state (https://example.com/screenshot.png)",
    "- Active thread, Will: Nested reference (https://example.com/nested.webp)",
  ].join("\n")
);
