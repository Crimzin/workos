import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const boardSource = readFileSync(
  new URL("./board.tsx", import.meta.url),
  "utf8"
);
const stackRowSource = readFileSync(
  new URL("./stack-row.tsx", import.meta.url),
  "utf8"
);
const threadPickerSource = readFileSync(
  new URL("./thread-picker-create.tsx", import.meta.url),
  "utf8"
);
const nodeActionsSource = readFileSync(
  new URL("../../lib/actions/nodes.ts", import.meta.url),
  "utf8"
);

assert.match(boardSource, /label="Add Stack"/);
assert.doesNotMatch(boardSource, /label="New Stack"/);
assert.doesNotMatch(boardSource, /Create Stack/);
assert.match(boardSource, /ThreadPickerCreate/);
assert.match(boardSource, /pl-7 pr-2/);
assert.match(boardSource, /menuAlign="right"/);
assert.match(boardSource, /collapsedStackIds/);
assert.match(boardSource, /handleToggleStackCollapse/);
assert.match(boardSource, /workos:collapsed-stacks/);
assert.match(boardSource, /w-\[28rem\]/);

assert.match(stackRowSource, /label="Add Card"/);
assert.match(stackRowSource, /ThreadPickerCreate/);
assert.match(stackRowSource, /pl-7 pr-2/);
assert.match(stackRowSource, /isStackCollapsed/);
assert.match(stackRowSource, /sticky left-0/);
assert.match(stackRowSource, /w-\[28rem\]/);
assert.match(stackRowSource, /bg-bg-secondary transition-colors/);
assert.doesNotMatch(stackRowSource, /bg-bg-secondary\/60/);
assert.match(stackRowSource, /whitespace-normal break-words text-xl/);
assert.match(stackRowSource, /group\/card-preview/);
assert.match(stackRowSource, /group-hover\/card-preview:block/);
assert.match(stackRowSource, /{col\.name}/);
assert.match(stackRowSource, /Mirrored/);
assert.match(stackRowSource, /CollapsedStackColumn/);
assert.match(stackRowSource, /title={card.title}/);
assert.match(stackRowSource, /aria-label=\{`Open \$\{card\.title\}`\}/);

assert.match(threadPickerSource, /SERVER_SEARCH_DEBOUNCE_MS/);
assert.match(threadPickerSource, /menuAlign/);
assert.match(nodeActionsSource, /THREAD_PLACEMENT_NODE_SELECT/);
assert.match(nodeActionsSource, /THREAD_PLACEMENT_DIRECT_TITLE_ROW_LIMIT/);
assert.match(nodeActionsSource, /THREAD_PLACEMENT_FUZZY_ROW_LIMIT/);
assert.match(nodeActionsSource, /\.or\(tokens\.map/);
assert.match(nodeActionsSource, /\.eq\("mirror_parent_id", targetParentId\)/);
assert.doesNotMatch(
  nodeActionsSource,
  /getThreadPlacementCandidates[\s\S]+?\.select\("\*"\)/
);
