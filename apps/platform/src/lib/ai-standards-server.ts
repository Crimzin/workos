import { unstable_cache } from "next/cache";
import {
  DEFAULT_AI_STANDARDS,
  mergeAIStandards,
  mergeAIStandardsForSettings,
  type AIStandardDefinition,
  type AIStandardOverrideRow,
} from "./ai-standards";
import { cacheTags } from "./cache";
import { supabase } from "./supabase";

export async function getEffectiveAIStandards(
  instanceId: string
): Promise<AIStandardDefinition[]> {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from("ai_standards")
        .select(
          "standard_key,category,title,instruction,mode,enabled,position,source"
        )
        .eq("instance_id", instanceId)
        .order("position", { ascending: true });

      if (error) throw error;

      return mergeAIStandards(
        DEFAULT_AI_STANDARDS,
        (data ?? []) as AIStandardOverrideRow[]
      );
    },
    [`ai-standards-instance-${instanceId}`],
    { tags: [cacheTags.aiStandards(instanceId)], revalidate: false }
  )();
}

export async function getAIStandardsForSettings(
  instanceId: string
): Promise<AIStandardDefinition[]> {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from("ai_standards")
        .select(
          "standard_key,category,title,instruction,mode,enabled,position,source"
        )
        .eq("instance_id", instanceId)
        .order("position", { ascending: true });

      if (error) throw error;

      return mergeAIStandardsForSettings(
        DEFAULT_AI_STANDARDS,
        (data ?? []) as AIStandardOverrideRow[]
      );
    },
    [`ai-standards-settings-instance-${instanceId}`],
    { tags: [cacheTags.aiStandards(instanceId)], revalidate: false }
  )();
}
