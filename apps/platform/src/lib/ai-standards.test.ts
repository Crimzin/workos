import assert from "node:assert/strict";
import {
  DEFAULT_AI_STANDARDS,
  mergeAIStandards,
  renderAIStandardsForPrompt,
} from "./ai-standards";
import type { AIStandardOverrideRow } from "./ai-standards";

assert.ok(
  DEFAULT_AI_STANDARDS.some(
    (s) => s.standard_key === "standard.ai_interaction.goal_first"
  )
);
assert.ok(
  DEFAULT_AI_STANDARDS.some(
    (s) => s.standard_key === "standard.output.pyramid_principle"
  )
);

const overrideRows: AIStandardOverrideRow[] = [
  {
    standard_key: "standard.output.pyramid_principle",
    category: "output",
    title: "Lead With The Answer",
    instruction: "Lead with the answer before supporting details.",
    mode: "visible_when_useful",
    enabled: true,
    position: 99,
    source: "override",
  },
  {
    standard_key: "standard.output.mece_structure",
    category: "output",
    title: "MECE structure",
    instruction: "Disabled override should remove this default.",
    mode: "visible_when_useful",
    enabled: false,
    position: 20,
    source: "override",
  },
  {
    standard_key: "standard.custom.exec_memo",
    category: "output",
    title: "Executive memo style",
    instruction: "Use crisp executive memo structure for leadership updates.",
    mode: "visible_when_useful",
    enabled: true,
    position: 200,
    source: "custom",
  },
];

const merged = mergeAIStandards(DEFAULT_AI_STANDARDS, overrideRows);

assert.equal(
  merged.find((s) => s.standard_key === "standard.output.pyramid_principle")
    ?.title,
  "Lead With The Answer"
);
assert.equal(
  merged.some((s) => s.standard_key === "standard.output.mece_structure"),
  false
);
assert.ok(merged.some((s) => s.standard_key === "standard.custom.exec_memo"));

const rendered = renderAIStandardsForPrompt(merged);
assert.match(rendered, /# BrainShare Inborn AI Standards/);
assert.match(rendered, /## Interaction/);
assert.match(rendered, /## Output/);
assert.match(rendered, /Lead With The Answer/);
assert.doesNotMatch(rendered, /Disabled override/);
