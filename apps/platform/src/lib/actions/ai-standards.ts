"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import { DEFAULT_AI_STANDARDS } from "../ai-standards";
import {
  normalizeAIStandardInput,
  standardKeyFromTitle,
  type AIStandardInput,
} from "../ai-standards-validation";
import { revalidateAIStandards } from "../cache";
import { supabase } from "../supabase";

export async function saveAIStandardOverride(
  input: AIStandardInput
): Promise<void> {
  const actor = await getCurrentActor();
  const payload = normalizeAIStandardInput(input);

  const { error } = await supabase.from("ai_standards").upsert(
    {
      instance_id: actor.instance_id,
      ...payload,
    },
    { onConflict: "instance_id,standard_key" }
  );
  if (error) throw error;

  revalidateAIStandards(actor.instance_id);
  revalidatePath("/settings/ai-standards");
}

export async function createCustomAIStandard(input: {
  category: AIStandardInput["category"];
  title: string;
  instruction: string;
  mode: AIStandardInput["mode"];
  position?: number;
}): Promise<void> {
  const standardKey = standardKeyFromTitle(input.title);
  await saveAIStandardOverride({
    standardKey,
    category: input.category,
    title: input.title,
    instruction: input.instruction,
    mode: input.mode,
    enabled: true,
    position: input.position ?? 1000,
    source: "custom",
  });
}

export async function resetAIStandardOverride(
  standardKey: string
): Promise<void> {
  const actor = await getCurrentActor();
  const { error } = await supabase
    .from("ai_standards")
    .delete()
    .eq("instance_id", actor.instance_id)
    .eq("standard_key", standardKey);
  if (error) throw error;

  revalidateAIStandards(actor.instance_id);
  revalidatePath("/settings/ai-standards");
}

export async function disableDefaultAIStandard(
  standardKey: string
): Promise<void> {
  const defaultStandard = DEFAULT_AI_STANDARDS.find(
    (standard) => standard.standard_key === standardKey
  );
  if (!defaultStandard) throw new Error("default_standard_not_found");

  await saveAIStandardOverride({
    standardKey: defaultStandard.standard_key,
    category: defaultStandard.category,
    title: defaultStandard.title,
    instruction: defaultStandard.instruction,
    mode: defaultStandard.mode,
    enabled: false,
    position: defaultStandard.position,
    source: "override",
  });
}
