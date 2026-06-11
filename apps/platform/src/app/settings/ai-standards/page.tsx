import { AIStandardsSettings } from "@/components/ai-standards-settings";
import { getAIStandardsForSettings } from "@/lib/ai-standards-server";
import { getCurrentActor } from "@/lib/actor";

export default async function AIStandardsSettingsPage() {
  const actor = await getCurrentActor();
  const standards = await getAIStandardsForSettings(actor.instance_id);
  const standardsKey = standards
    .map(
      (standard) =>
        `${standard.standard_key}:${standard.source}:${standard.enabled}:${standard.mode}:${standard.title}:${standard.instruction}`
    )
    .join("|");

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-text-primary">
          AI Standards
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          Universal standards that shape how AI teammates collaborate and
          structure their output.
        </p>
      </div>
      <AIStandardsSettings key={standardsKey} standards={standards} />
    </section>
  );
}
