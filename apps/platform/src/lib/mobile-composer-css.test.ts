import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const mobileComposerEditorSelector =
  '.post-composer-editor[data-mobile-composer="true"] .bn-post-editor .bn-editor';
const mobileMediaIndex = css.indexOf("@media (max-width: 767px)");

assert.notEqual(
  mobileMediaIndex,
  -1,
  "mobile composer styles should live in the mobile media query"
);

const selectorIndex = css.indexOf(mobileComposerEditorSelector, mobileMediaIndex);
assert.notEqual(
  selectorIndex,
  -1,
  "mobile composer editor should have a mobile-specific style rule"
);

const declarationStart = css.indexOf("{", selectorIndex);
const declarationEnd = css.indexOf("}", declarationStart);
const declarations = css.slice(declarationStart + 1, declarationEnd);
const fontSize = declarations.match(/font-size:\s*([^;]+);/)?.[1]?.trim();

assert.equal(
  fontSize,
  "16px",
  "mobile composer editor text must be 16px to avoid iOS focus zoom"
);
