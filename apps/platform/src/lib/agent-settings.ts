import { unstable_cache } from "next/cache";
import { cacheTags } from "./cache";
import { supabase } from "./supabase";
import type { AgentProviderSetting, AgentToolSetting } from "./types";

export interface AgentSettingsBundle {
  providers: AgentProviderSetting[];
  tools: AgentToolSetting[];
}

export async function getAgentSettings(
  instanceId: string
): Promise<AgentSettingsBundle> {
  return unstable_cache(
    async () => {
      const [providersResult, toolsResult] = await Promise.all([
        supabase
          .from("agent_provider_settings")
          .select(
            "id,instance_id,provider_key,label,enabled,config,created_at,updated_at"
          )
          .eq("instance_id", instanceId)
          .order("provider_key", { ascending: true }),
        supabase
          .from("agent_tool_settings")
          .select(
            "id,instance_id,tool_key,label,status,config,created_at,updated_at"
          )
          .eq("instance_id", instanceId)
          .order("tool_key", { ascending: true }),
      ]);

      if (providersResult.error) throw providersResult.error;
      if (toolsResult.error) throw toolsResult.error;

      return {
        providers: (providersResult.data ?? []) as AgentProviderSetting[],
        tools: (toolsResult.data ?? []) as AgentToolSetting[],
      };
    },
    [`agent-settings-${instanceId}`],
    { tags: [cacheTags.agentSettings(instanceId)], revalidate: false }
  )();
}
