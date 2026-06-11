import { AgentSettings } from "@/components/agent-settings";
import { getAgentSettings } from "@/lib/agent-settings";
import { getCurrentActor } from "@/lib/actor";

export const dynamic = "force-dynamic";

export default async function AgentsSettingsPage() {
  const actor = await getCurrentActor();
  const settings = await getAgentSettings(actor.instance_id);
  const settingsKey = [
    ...settings.providers.map(
      (provider) =>
        `${provider.provider_key}:${provider.enabled}:${JSON.stringify(provider.config)}`
    ),
    ...settings.tools.map((tool) => `${tool.tool_key}:${tool.status}`),
  ].join("|");

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-text-primary">Agents</h2>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          Connect AI teammates, choose default models, and manage required tools.
        </p>
      </div>
      <AgentSettings
        key={settingsKey}
        providers={settings.providers}
        tools={settings.tools}
      />
    </section>
  );
}
