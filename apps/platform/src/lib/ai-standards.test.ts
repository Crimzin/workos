import assert from "node:assert/strict";
import {
  DEFAULT_AI_STANDARDS,
  mergeAIStandards,
  mergeAIStandardsForSettings,
  renderAIStandardsForPrompt,
} from "./ai-standards";
import type {
  AIStandardDefinition,
  AIStandardOverrideRow,
} from "./ai-standards";

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
assert.ok(
  DEFAULT_AI_STANDARDS.some(
    (s) => s.standard_key === "standard.ai_interaction.collaboration_mode"
  )
);
assert.ok(
  DEFAULT_AI_STANDARDS.some(
    (s) => s.standard_key === "standard.ai_interaction.one_question_at_a_time"
  )
);
assert.ok(
  DEFAULT_AI_STANDARDS.some(
    (s) =>
      s.standard_key ===
      "standard.ai_interaction.agentic_operating_discipline"
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
assert.match(rendered, /## Response-mode protocol/);
assert.match(rendered, /do not one-shot the artifact/);
assert.match(rendered, /Latent standards/);
assert.match(rendered, /Visible-when-useful standards/);
assert.match(rendered, /Lead With The Answer/);
assert.doesNotMatch(rendered, /Disabled override/);

function assertAppearsAfter(
  renderedPrompt: string,
  earlierText: string,
  laterText: string
) {
  const earlierIndex = renderedPrompt.indexOf(earlierText);
  const laterIndex = renderedPrompt.indexOf(laterText);

  assert.notEqual(earlierIndex, -1, `Missing expected text: ${earlierText}`);
  assert.notEqual(laterIndex, -1, `Missing expected text: ${laterText}`);
  assert.ok(
    laterIndex > earlierIndex,
    `Expected "${laterText}" to appear after "${earlierText}"`
  );
}

const modePlacementFixture: AIStandardDefinition[] = [
  {
    standard_key: "standard.test.latent",
    category: "interaction",
    title: "Quiet Judgment Fixture",
    instruction: "Apply this quietly.",
    mode: "latent",
    enabled: true,
    position: 10,
    source: "custom",
  },
  {
    standard_key: "standard.test.visible",
    category: "interaction",
    title: "Visible Structure Fixture",
    instruction: "Make this visible when useful.",
    mode: "visible_when_useful",
    enabled: true,
    position: 20,
    source: "custom",
  },
];

const modePlacementRendered = renderAIStandardsForPrompt(modePlacementFixture);
assertAppearsAfter(
  modePlacementRendered,
  "Latent standards",
  "Quiet Judgment Fixture"
);
assertAppearsAfter(
  modePlacementRendered,
  "Quiet Judgment Fixture",
  "Visible-when-useful standards"
);
assertAppearsAfter(
  modePlacementRendered,
  "Visible-when-useful standards",
  "Visible Structure Fixture"
);

const flippedModePlacementRendered = renderAIStandardsForPrompt([
  { ...modePlacementFixture[0], mode: "visible_when_useful" },
  modePlacementFixture[1],
]);
assertAppearsAfter(
  flippedModePlacementRendered,
  "Visible-when-useful standards",
  "Quiet Judgment Fixture"
);
assertAppearsAfter(
  flippedModePlacementRendered,
  "Visible-when-useful standards",
  "Visible Structure Fixture"
);

const settingsMerged = mergeAIStandardsForSettings(
  DEFAULT_AI_STANDARDS,
  overrideRows
);
const disabledDefault = settingsMerged.find(
  (s) => s.standard_key === "standard.output.mece_structure"
);

assert.equal(disabledDefault?.enabled, false);
assert.equal(disabledDefault?.source, "override");
assert.equal(disabledDefault?.instruction, "Disabled override should remove this default.");
assert.ok(
  settingsMerged.some((s) => s.standard_key === "standard.custom.exec_memo")
);
