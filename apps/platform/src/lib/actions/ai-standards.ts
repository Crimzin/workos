"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import { DEFAULT_AI_STANDARDS } from "../ai-standards";
import type { AIStandard } from "../types";
import {
  normalizeAIStandardInput,
  standardKeyFromTitle,
  type AIStandardInput,
} from "../ai-standards-validation";
import { revalidateAIStandards } from "../cache";
import { supabase } from "../supabase";

function getDefaultStandard(standardKey: string) {
  const normalizedKey = standardKey.trim();
  const defaultStandard = DEFAULT_AI_STANDARDS.find(
    (standard) => standard.standard_key === normalizedKey
  );
  if (!defaultStandard) throw new Error("default_standard_not_found");
  return defaultStandard;
}

function assertCustomStandardKey(standardKey: string) {
  if (!standardKey.startsWith("standard.custom.")) {
    throw new Error("invalid_custom_standard_key");
  }
}

export async function saveAIStandardOverride(
  input: AIStandardInput
): Promise<void> {
  const actor = await getCurrentActor();
  const defaultStandard = getDefaultStandard(input.standardKey);
  const payload = normalizeAIStandardInput({
    ...input,
    standardKey: defaultStandard.standard_key,
    source: "override",
  });

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
}): Promise<AIStandard> {
  const standardKey = `${standardKeyFromTitle(input.title)}.${randomUUID()}`;
  assertCustomStandardKey(standardKey);

  const actor = await getCurrentActor();
  const payload = normalizeAIStandardInput({
    standardKey,
    category: input.category,
    title: input.title,
    instruction: input.instruction,
    mode: input.mode,
    enabled: true,
    position: input.position ?? 1000,
    source: "custom",
  });

  const { error } = await supabase.from("ai_standards").insert({
    instance_id: actor.instance_id,
    ...payload,
  });
  if (error) throw error;

  revalidateAIStandards(actor.instance_id);
  revalidatePath("/settings/ai-standards");

  return payload;
}

export async function saveCustomAIStandard(
  input: AIStandardInput
): Promise<void> {
  const actor = await getCurrentActor();
  assertCustomStandardKey(input.standardKey);
  const payload = normalizeAIStandardInput({
    ...input,
    source: "custom",
  });

  const { error } = await supabase
    .from("ai_standards")
    .update(payload)
    .eq("instance_id", actor.instance_id)
    .eq("standard_key", payload.standard_key)
    .eq("source", "custom");
  if (error) throw error;

  revalidateAIStandards(actor.instance_id);
  revalidatePath("/settings/ai-standards");
}

export async function resetAIStandardOverride(
  standardKey: string
): Promise<void> {
  const actor = await getCurrentActor();
  const defaultStandard = getDefaultStandard(standardKey);
  const { error } = await supabase
    .from("ai_standards")
    .delete()
    .eq("instance_id", actor.instance_id)
    .eq("standard_key", defaultStandard.standard_key)
    .eq("source", "override");
  if (error) throw error;

  revalidateAIStandards(actor.instance_id);
  revalidatePath("/settings/ai-standards");
}

export async function deleteCustomAIStandard(
  standardKey: string
): Promise<void> {
  const normalizedKey = standardKey.trim();
  assertCustomStandardKey(normalizedKey);

  const actor = await getCurrentActor();
  const { error } = await supabase
    .from("ai_standards")
    .delete()
    .eq("instance_id", actor.instance_id)
    .eq("standard_key", normalizedKey)
    .eq("source", "custom");
  if (error) throw error;

  revalidateAIStandards(actor.instance_id);
  revalidatePath("/settings/ai-standards");
}

export async function disableDefaultAIStandard(
  standardKey: string
): Promise<void> {
  const defaultStandard = getDefaultStandard(standardKey);

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
