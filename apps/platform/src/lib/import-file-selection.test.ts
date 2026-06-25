import assert from "node:assert/strict";
import {
  MAX_IMPORT_FILE_BYTES,
  planImportFileSelection,
} from "./import-file-selection.ts";

const folderName = "data-batch-0000";

const folderPlan = planImportFileSelection({
  candidates: [
    {
      name: "conversations.json",
      size: 29_738_857,
      webkitRelativePath: `${folderName}/conversations.json`,
    },
    {
      name: "users.json",
      size: 160,
      webkitRelativePath: `${folderName}/users.json`,
    },
    {
      name: "memories.json",
      size: 31_000,
      webkitRelativePath: `${folderName}/memories.json`,
    },
    {
      name: "019c86e6-f497-7136-8e71-1af33e0a3ce1.json",
      size: 19_000,
      webkitRelativePath: `${folderName}/projects/019c86e6-f497-7136-8e71-1af33e0a3ce1.json`,
    },
    {
      name: ".DS_Store",
      size: 6_000,
      webkitRelativePath: `${folderName}/.DS_Store`,
    },
  ],
  currentByteCount: 0,
  currentFileCount: 0,
});

assert.deepEqual(
  folderPlan.accepted.map((item) => item.fileName),
  [`${folderName}/conversations.json`]
);
assert.deepEqual(folderPlan.errors, []);

const directPlan = planImportFileSelection({
  candidates: [
    {
      name: "export.json",
      size: 1024,
    },
  ],
  currentByteCount: 0,
  currentFileCount: 0,
});

assert.deepEqual(
  directPlan.accepted.map((item) => item.fileName),
  ["export.json"]
);

const tooLargePlan = planImportFileSelection({
  candidates: [
    {
      name: "conversations.json",
      size: MAX_IMPORT_FILE_BYTES + 1,
      webkitRelativePath: `${folderName}/conversations.json`,
    },
  ],
  currentByteCount: 0,
  currentFileCount: 0,
});

assert.deepEqual(tooLargePlan.accepted, []);
assert.match(tooLargePlan.errors.join(" "), /150 MB/);
