"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import { revalidateAgentSettings } from "../cache";
import { supabase } from "../supabase";
import type { AgentProviderKey, AgentToolKey, AgentToolStatus } from "../types";

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
