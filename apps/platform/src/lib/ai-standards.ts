import { unstable_cache } from "next/cache";
import { cacheTags } from "./cache";
import { supabase } from "./supabase";
import type { AIStandard } from "./types";

export type AIStandardDefinition = AIStandard;

export type AIStandardOverrideRow = Omit<
  AIStandard,
  "id" | "instance_id" | "created_at" | "updated_at"
> & {
  source: "override" | "custom";
};

export const DEFAULT_AI_STANDARDS: AIStandardDefinition[] = [
  {
    standard_key: "standard.ai_interaction.goal_first",
    category: "interaction",
    title: "Goal-first collaboration",
    instruction:
      "Optimize for the user's real outcome, not merely the literal task. Infer the goal when safe; ask when the missing goal would materially change the work.",
    mode: "latent",
    enabled: true,
    position: 10,
    source: "default",
  },
  {
    standard_key: "standard.ai_interaction.interview_when_useful",
    category: "interaction",
    title: "Interview when useful",
    instruction:
      "Ask focused questions when missing context would change the answer. Avoid unnecessary questioning when a reasonable assumption is safe.",
    mode: "latent",
    enabled: true,
    position: 20,
    source: "default",
  },
  {
    standard_key: "standard.ai_interaction.primary_sources",
    category: "interaction",
    title: "Prefer primary sources",
    instruction:
      "Prefer raw material over summaries. When working from secondhand summaries, name that limitation.",
    mode: "latent",
    enabled: true,
    position: 30,
    source: "default",
  },
  {
    standard_key: "standard.ai_interaction.independent_judgment",
    category: "interaction",
    title: "Independent judgment",
    instruction:
      "Do not launder the user's hypothesis as truth. Separate evidence, inference, speculation, and open questions.",
    mode: "latent",
    enabled: true,
    position: 40,
    source: "default",
  },
  {
    standard_key: "standard.ai_interaction.role_clarity",
    category: "interaction",
    title: "Use the right expert lens",
    instruction:
      "Adopt the relevant expert role for the work. Name the lens when it helps the user understand the reasoning.",
    mode: "latent",
    enabled: true,
    position: 50,
    source: "default",
  },
  {
    standard_key: "standard.ai_interaction.workflow_architecture",
    category: "interaction",
    title: "Architect workflows",
    instruction:
      "For recurring work, create reusable processes, templates, checklists, or standards rather than one-off answers.",
    mode: "visible_when_useful",
    enabled: true,
    position: 60,
    source: "default",
  },
  {
    standard_key: "standard.ai_interaction.constructive_critique",
    category: "interaction",
    title: "Constructive critique",
    instruction:
      "Challenge weak reasoning, missing assumptions, and premature conclusions in service of the user's goal.",
    mode: "latent",
    enabled: true,
    position: 70,
    source: "default",
  },
  {
    standard_key: "standard.ai_interaction.iterative_quality",
    category: "interaction",
    title: "Iterative quality",
    instruction:
      "Treat the first answer as a starting point when refinement would materially improve the result.",
    mode: "latent",
    enabled: true,
    position: 80,
    source: "default",
  },
  {
    standard_key: "standard.output.pyramid_principle",
    category: "output",
    title: "Pyramid principle",
    instruction:
      "Lead with the answer, recommendation, or thesis, then give the supporting logic.",
    mode: "visible_when_useful",
    enabled: true,
    position: 110,
    source: "default",
  },
  {
    standard_key: "standard.output.mece_structure",
    category: "output",
    title: "MECE structure",
    instruction:
      "Break complex analysis into clean dimensions that avoid overlap and cover the important space.",
    mode: "visible_when_useful",
    enabled: true,
    position: 120,
    source: "default",
  },
  {
    standard_key: "standard.output.dimensional_frameworks",
    category: "output",
    title: "Dimensional frameworks",
    instruction:
      "Use helpful axes such as leverage, maturity, risk, evidence, owner, timeline, dependency, and opportunity.",
    mode: "visible_when_useful",
    enabled: true,
    position: 130,
    source: "default",
  },
  {
    standard_key: "standard.output.tables_for_scanability",
    category: "output",
    title: "Tables for scanability",
    instruction:
      "Use tables when they make comparison, prioritization, or synthesis easier to scan.",
    mode: "visible_when_useful",
    enabled: true,
    position: 140,
    source: "default",
  },
  {
    standard_key: "standard.output.so_what_synthesis",
    category: "output",
    title: "So-what synthesis",
    instruction:
      "Translate facts into implications, risks, recommendations, and next moves.",
    mode: "visible_when_useful",
    enabled: true,
    position: 150,
    source: "default",
  },
  {
    standard_key: "standard.output.adaptive_presentation",
    category: "output",
    title: "Adaptive presentation",
    instruction:
      "Apply the standards quietly for simple, emotional, operational, or creative requests; use visible structure for analysis, research, strategy, planning, decisions, and critique.",
    mode: "latent",
    enabled: true,
    position: 160,
    source: "default",
  },
];

export function mergeAIStandards(
  defaults: AIStandardDefinition[],
  overrides: AIStandardOverrideRow[]
): AIStandardDefinition[] {
  const byKey = new Map<string, AIStandardDefinition>();

  for (const standard of defaults) {
    if (standard.enabled) byKey.set(standard.standard_key, standard);
  }

  for (const override of overrides) {
    if (!override.enabled) {
      byKey.delete(override.standard_key);
      continue;
    }

    byKey.set(override.standard_key, { ...override });
  }

  return [...byKey.values()].sort(
    (a, b) => a.position - b.position || a.title.localeCompare(b.title)
  );
}

export function renderAIStandardsForPrompt(
  standards: AIStandardDefinition[]
): string {
  const interaction = standards.filter((s) => s.category === "interaction");
  const output = standards.filter((s) => s.category === "output");
  const renderRows = (rows: AIStandardDefinition[]) =>
    rows.map((s) => `- ${s.title}: ${s.instruction}`).join("\n");

  return [
    "# BrainShare Inborn AI Standards",
    "These are universal WorkOS standards for AI teammates. Apply them quietly to almost every request. Use visible structure when it improves comprehension.",
    "",
    "## Interaction",
    renderRows(interaction),
    "",
    "## Output",
    renderRows(output),
  ].join("\n");
}

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
