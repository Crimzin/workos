import assert from "node:assert/strict";
import {
  clampDetailPanelWidth,
  detailPanelWidthFromPointer,
  getDetailPanelMaxWidth,
  snapDetailPanelWidth,
} from "./panel-resize";

assert.equal(getDetailPanelMaxWidth(1200), 1196);
assert.equal(clampDetailPanelWidth(1200, 1400), 1200);
assert.equal(clampDetailPanelWidth(1400, 1200), 1196);
assert.equal(clampDetailPanelWidth(200, 1200), 320);

assert.equal(
  detailPanelWidthFromPointer({
    containerLeft: 0,
    containerRight: 1200,
    pointerX: 0,
  }),
  1196
);

assert.equal(snapDetailPanelWidth(1190, 1200), 1196);
assert.equal(snapDetailPanelWidth(333, 1200), 320);
assert.equal(snapDetailPanelWidth(514, 1200), 520);
