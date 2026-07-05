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
const cardTileSource = readFileSync(
  new URL("./card-tile.tsx", import.meta.url),
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
assert.match(boardSource, /w-60/);
assert.doesNotMatch(boardSource, /w-\[28rem\]/);

assert.match(stackRowSource, /label="Add Card"/);
assert.match(stackRowSource, /ThreadPickerCreate/);
assert.match(stackRowSource, /pl-7 pr-2/);
assert.match(stackRowSource, /isStackCollapsed/);
assert.match(stackRowSource, /sticky left-0/);
assert.match(stackRowSource, /w-60/);
assert.doesNotMatch(stackRowSource, /w-\[28rem\]/);
assert.match(stackRowSource, /bg-bg-secondary transition-colors/);
assert.doesNotMatch(stackRowSource, /bg-bg-secondary\/60/);
assert.match(stackRowSource, /whitespace-normal break-words text-xl/);
assert.match(stackRowSource, /className="group relative block min-w-0 px-1"/);
assert.doesNotMatch(stackRowSource, /group relative block min-w-0 px-1 pr-7/);
assert.doesNotMatch(stackRowSource, /section-label truncate">\s*Stack/);
assert.match(stackRowSource, /menuOpen \? "z-\[70\]" : "z-30"/);
assert.match(stackRowSource, /z-\[80\]/);
assert.match(stackRowSource, /aria-label="Mirrored stack"/);
assert.doesNotMatch(
  stackRowSource,
  /<span className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-1\.5 py-0\.5 text-\[10px\] font-medium text-text-tertiary">\s*<GitFork size=\{10\} aria-hidden \/>\s*Mirrored\s*<\/span>/
);
assert.match(stackRowSource, /group\/card-preview/);
assert.match(stackRowSource, /group-hover\/card-preview:block/);
assert.match(stackRowSource, /{col\.name}/);
assert.match(stackRowSource, /Mirrored/);
assert.match(stackRowSource, /CollapsedStackColumn/);
assert.match(stackRowSource, /title={card.title}/);
assert.match(stackRowSource, /aria-label=\{`Open \$\{card\.title\}`\}/);

assert.doesNotMatch(cardTileSource, /InlineFieldEditor/);
assert.doesNotMatch(cardTileSource, /FieldBadge/);
assert.doesNotMatch(cardTileSource, /getStaticBadges/);
assert.doesNotMatch(cardTileSource, /editorFields/);
assert.match(cardTileSource, /"group relative block rounded-md border p-2 transition-colors"/);
assert.match(cardTileSource, /BoardAvatar actor=\{actors\[card\.owner_id\]\} size=\{16\}/);
assert.match(cardTileSource, /absolute bottom-1\.5 right-1\.5/);
assert.match(cardTileSource, /pointer-events-none/);
assert.match(cardTileSource, /group-hover:pointer-events-auto/);
assert.match(cardTileSource, /group-hover:opacity-100 focus-within:opacity-100/);
assert.doesNotMatch(cardTileSource, /flex items-start justify-between gap-2/);
assert.doesNotMatch(
  cardTileSource,
  /<div className="flex shrink-0 items-center gap-1">\s*\{card\.owner_id/
);
assert.doesNotMatch(cardTileSource, /mt-2 flex flex-wrap items-center justify-between/);
assert.doesNotMatch(cardTileSource, /card\.field_values\[field\.id\]/);

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
