import assert from "node:assert/strict";
import { buildPostClipboardPayload } from "./post-clipboard";

const styledPostDom = `
  <div class="bn-block-outer" contenteditable="false" style="color: rgb(156, 163, 175); display: grid;">
    <div data-content-type="paragraph" class="bn-block-content" style="color: rgb(156, 163, 175);">
      <div class="bn-inline-content">
        Hello <span data-mention-id="agent-1" style="color: rgb(124, 58, 237);">@Claude</span>
      </div>
    </div>
    <div class="bn-side-menu">Delete row</div>
  </div>
  <div class="bn-block-outer" contenteditable="false" style="display: flex;">
    <div data-content-type="paragraph" class="bn-block-content">
      <div class="bn-inline-content">Second line</div>
    </div>
  </div>
`;

const styledPayload = buildPostClipboardPayload({ html: styledPostDom });

assert.equal(styledPayload.html, "<p>Hello @Claude</p><p>Second line</p>");
assert.equal(styledPayload.text, "Hello @Claude\n\nSecond line");
assert.doesNotMatch(styledPayload.html, /style|class|data-|contenteditable|bn-/);

const tableDom = `
  <div class="bn-block-outer" contenteditable="false">
    <div data-content-type="table" style="color: rgb(229, 229, 229);">
      <div class="tableWrapper">
        <table class="bn-table" style="--default-cell-min-width: 120px;">
          <tbody>
            <tr>
              <th style="color: gray;">Component</th>
              <td colspan="2" class="is-selected">Foundation</td>
            </tr>
            <tr>
              <th>Investment</th>
              <td colspan="2">$12,500</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="bn-drag-handle-menu">Delete row</div>
  </div>
`;

const tablePayload = buildPostClipboardPayload({ html: tableDom });

assert.equal(
  tablePayload.html,
  '<table><tbody><tr><th>Component</th><td colspan="2">Foundation</td></tr><tr><th>Investment</th><td colspan="2">$12,500</td></tr></tbody></table>'
);
assert.equal(tablePayload.text, "Component\tFoundation\nInvestment\t$12,500");
assert.doesNotMatch(tablePayload.html, /style|class|data-|contenteditable|bn-/);

const linksPayload = buildPostClipboardPayload({
  html: `
    <p>
      <a href="javascript:alert(1)" style="color: gray;">bad</a>
      <a href="https://example.com/path?x=1&y=2" target="_blank" rel="noreferrer">ok</a>
    </p>
  `,
});

assert.equal(
  linksPayload.html,
  '<p><a>bad</a> <a href="https://example.com/path?x=1&amp;y=2">ok</a></p>'
);
assert.equal(linksPayload.text, "bad ok");
