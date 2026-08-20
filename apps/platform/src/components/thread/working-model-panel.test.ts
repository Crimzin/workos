import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(name: string): string {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

const panel = source("./working-model-panel.tsx");
const claimCard = source("./working-model-claim-card.tsx");
const traceView = source("./reason-trace-view.tsx");
const contextPanel = source("./context-panel.tsx");
const threadSurface = source("./thread-surface.tsx");

assert.match(contextPanel, />\s*Working model\s*</);
assert.match(panel, /label: "Model"/);
assert.match(panel, /label: "Answers"/);
assert.match(panel, /label: "Sources"/);
assert.match(panel, /model\.groups\.map/);
assert.doesNotMatch(claimCard, /cachedScore|cached_score/);
assert.match(claimCard, /postureLabel/);
assert.match(claimCard, /<EvidenceGroup/);
assert.match(claimCard, /<WorkingModelCorrectionControls/);
assert.match(claimCard, /threadId/);
assert.match(traceView, /Why this answer/);
assert.match(traceView, /Rested on/);
assert.match(traceView, /Why these were in play/);
assert.match(traceView, /ChangedStateNotice/);
assert.match(traceView, /<WorkingModelCorrectionControls/);
assert.match(source("./changed-state-notice.tsx"), /diff\.reason/);
assert.match(panel, /fieldsContent/);
assert.match(panel, /treeContent/);
assert.match(threadSurface, /workingModel={workingModel}/);
assert.match(threadSurface, /answerTraces={answerTraces}/);

const userFacing = [panel, claimCard, traceView].join("\n");
assert.doesNotMatch(
  userFacing,
  />[^<]*(primitive|episode|brainshare|embedding|reranker|chain-of-thought)[^<]*</i
);
assert.doesNotMatch(userFacing, /(?:bg|text|border)-\[#/);
