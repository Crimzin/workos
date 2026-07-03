import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const filesExpectedToUseSourceChip = [
  "src/components/sidebar.tsx",
  "src/components/post-item.tsx",
  "src/components/thread/context-panel.tsx",
  "src/components/thread/context-event.tsx",
  "src/components/settings/sources-settings.tsx",
  "src/components/post-editor.tsx",
];

for (const file of filesExpectedToUseSourceChip) {
  const source = readPlatformFile(file);
  assert.match(source, /SourceChip/, `${file} should use SourceChip`);
}

const sidebarSource = readPlatformFile("src/components/sidebar.tsx");
assert.doesNotMatch(
  sidebarSource,
  /sourceLogoLabels/,
  "sidebar should not keep a local source-logo label map"
);

function readPlatformFile(pathFromPlatformRoot: string): string {
  const cwd = process.cwd();
  const platformRoot = cwd.endsWith("apps/platform")
    ? cwd
    : resolve(cwd, "apps/platform");
  return readFileSync(resolve(platformRoot, pathFromPlatformRoot), "utf8");
}
