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
    <main className="h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header>
          <div className="section-label">Admin</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">
            AI Standards
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Universal standards that shape how AI teammates collaborate and
            structure their output.
          </p>
        </header>

        <AIStandardsSettings key={standardsKey} standards={standards} />
      </div>
    </main>
  );
}
