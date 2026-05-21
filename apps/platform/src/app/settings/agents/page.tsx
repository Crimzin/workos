import { AgentSettings } from "@/components/agent-settings";
import { getAgentSettings } from "@/lib/agent-settings";
import { getCurrentActor } from "@/lib/actor";

export const dynamic = "force-dynamic";

export default async function AgentsSettingsPage() {
  const actor = await getCurrentActor();
  const settings = await getAgentSettings(actor.instance_id);
  const settingsKey = [
    ...settings.providers.map(
      (provider) => `${provider.provider_key}:${provider.enabled}`
    ),
    ...settings.tools.map((tool) => `${tool.tool_key}:${tool.status}`),
  ].join("|");

  return (
    <main className="h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header>
          <div className="section-label">Admin</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">
            Agents
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Connect AI teammates and the tools they need to work inside WorkOS.
          </p>
        </header>

        <AgentSettings
          key={settingsKey}
          providers={settings.providers}
          tools={settings.tools}
        />
      </div>
    </main>
  );
}
