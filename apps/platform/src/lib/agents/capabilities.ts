import { supabase } from "../supabase";
import type { AgentCapability, AgentProviderKey } from "../types";
import type { MentionedAgent } from "./mention-detection";
import type { ResolvedAgentRoute } from "./types";

const CHAT_ONLY: AgentCapability[] = ["chat"];
const CODING: AgentCapability[] = ["chat", "code", "shell", "git"];

function providerFromName(name: string): AgentProviderKey {
  const normalized = name.toLowerCase();
  if (normalized.includes("codex")) return "codex";
  if (normalized.includes("claude code")) return "claude_code";
  return "inline_claude";
}

function fallbackCapabilities(providerKey: AgentProviderKey): AgentCapability[] {
  if (providerKey === "codex" || providerKey === "claude_code") return CODING;
  return CHAT_ONLY;
}

export function routeKindForCapabilities(
  capabilities: AgentCapability[]
): ResolvedAgentRoute["kind"] {
  return capabilities.includes("code") ? "coding_plan" : "inline_chat";
}

export async function resolveAgentRoutes(
  mentions: MentionedAgent[]
): Promise<ResolvedAgentRoute[]> {
  if (mentions.length === 0) return [];

  const { data, error } = await supabase
    .from("agent_actor_capabilities")
    .select("actor_id,capability,enabled")
    .in(
      "actor_id",
      mentions.map((mention) => mention.id)
    )
    .eq("enabled", true);
  if (error) throw error;

  const byActor = new Map<string, AgentCapability[]>();
  for (const row of data ?? []) {
    const capability = row.capability as AgentCapability;
    const current = byActor.get(row.actor_id as string) ?? [];
    byActor.set(row.actor_id as string, [...current, capability]);
  }

  return mentions.map((mention) => {
    const providerKey = providerFromName(mention.name);
    const capabilities =
      byActor.get(mention.id) ?? fallbackCapabilities(providerKey);
    return {
      mention,
      providerKey,
      capabilities,
      kind: routeKindForCapabilities(capabilities),
    };
  });
}
