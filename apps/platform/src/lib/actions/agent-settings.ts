"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import { revalidateAgentSettings } from "../cache";
import { withProviderDefaultModelConfig } from "../agents/model-selection";
import { supabase } from "../supabase";
import type { AgentProviderKey, AgentToolKey, AgentToolStatus } from "../types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function setAgentProviderEnabled(
  providerKey: AgentProviderKey,
  enabled: boolean
): Promise<void> {
  const actor = await getCurrentActor();
  const { error } = await supabase
    .from("agent_provider_settings")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("instance_id", actor.instance_id)
    .eq("provider_key", providerKey);
  if (error) throw error;

  revalidateAgentSettings(actor.instance_id);
  revalidatePath("/settings/agents");
}

export async function setAgentProviderDefaultModel(
  providerKey: AgentProviderKey,
  modelId: string
): Promise<void> {
  const actor = await getCurrentActor();
  const { data, error: readError } = await supabase
    .from("agent_provider_settings")
    .select("config")
    .eq("instance_id", actor.instance_id)
    .eq("provider_key", providerKey)
    .single();
  if (readError) throw readError;

  const config = withProviderDefaultModelConfig(
    asRecord(data?.config),
    providerKey,
    modelId
  );
  const { error } = await supabase
    .from("agent_provider_settings")
    .update({ config, updated_at: new Date().toISOString() })
    .eq("instance_id", actor.instance_id)
    .eq("provider_key", providerKey);
  if (error) throw error;

  revalidateAgentSettings(actor.instance_id);
  revalidatePath("/settings/agents");
}

export async function setAgentToolStatus(
  toolKey: AgentToolKey,
  status: AgentToolStatus
): Promise<void> {
  const actor = await getCurrentActor();
  const { error } = await supabase
    .from("agent_tool_settings")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("instance_id", actor.instance_id)
    .eq("tool_key", toolKey);
  if (error) throw error;

  revalidateAgentSettings(actor.instance_id);
  revalidatePath("/settings/agents");
}
