import type {
  AIStandardCategory,
  AIStandardMode,
  AIStandardSource,
} from "./types";

export interface AIStandardInput {
  standardKey: string;
  category: AIStandardCategory;
  title: string;
  instruction: string;
  mode: AIStandardMode;
  enabled: boolean;
  position: number;
  source: Exclude<AIStandardSource, "default">;
}

export interface NormalizedAIStandardInput {
  standard_key: string;
  category: AIStandardCategory;
  title: string;
  instruction: string;
  mode: AIStandardMode;
  enabled: boolean;
  position: number;
  source: "override" | "custom";
}

export function normalizeAIStandardInput(
  input: AIStandardInput
): NormalizedAIStandardInput {
  const standardKey = input.standardKey.trim();
  const title = input.title.trim();
  const instruction = input.instruction.trim();

  if (!standardKey) throw new Error("standard_key_required");
  if (!title) throw new Error("title_required");
  if (!instruction) throw new Error("instruction_required");
  if (!["interaction", "output"].includes(input.category)) {
    throw new Error("invalid_category");
  }
  if (!["latent", "visible_when_useful"].includes(input.mode)) {
    throw new Error("invalid_mode");
  }
  if (!["override", "custom"].includes(input.source)) {
    throw new Error("invalid_source");
  }

  return {
    standard_key: standardKey,
    category: input.category,
    title,
    instruction,
    mode: input.mode,
    enabled: input.enabled,
    position: Number.isFinite(input.position) ? input.position : 0,
    source: input.source,
  };
}

export function standardKeyFromTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!slug) throw new Error("title_required");
  return `standard.custom.${slug}`;
}
