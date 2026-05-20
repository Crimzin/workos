import assert from "node:assert/strict";
import {
  normalizeAIStandardInput,
  standardKeyFromTitle,
} from "./ai-standards-validation";

const normalized = normalizeAIStandardInput({
  standardKey: "standard.output.pyramid_principle",
  category: "output",
  title: "  Pyramid principle  ",
  instruction: "  Lead with the answer.  ",
  mode: "visible_when_useful",
  enabled: true,
  position: 10,
  source: "override",
});

assert.equal(normalized.standard_key, "standard.output.pyramid_principle");
assert.equal(normalized.title, "Pyramid principle");
assert.equal(normalized.instruction, "Lead with the answer.");

assert.throws(
  () =>
    normalizeAIStandardInput({
      standardKey: "standard.output.empty",
      category: "output",
      title: "",
      instruction: "Use structure.",
      mode: "latent",
      enabled: true,
      position: 1,
      source: "override",
    }),
  /title_required/
);

assert.throws(
  () =>
    normalizeAIStandardInput({
      standardKey: "standard.output.empty",
      category: "output",
      title: "Empty instruction",
      instruction: "",
      mode: "latent",
      enabled: true,
      position: 1,
      source: "override",
    }),
  /instruction_required/
);

assert.equal(
  standardKeyFromTitle("Executive Memo Style"),
  "standard.custom.executive_memo_style"
);
