"use client";

import { useState, useTransition } from "react";
import {
  Bot,
  CheckCircle2,
  PlugZap,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import {
  setAgentProviderEnabled,
  setAgentToolStatus,
} from "@/lib/actions/agent-settings";
import type { AgentProviderSetting, AgentToolSetting } from "@/lib/types";

export interface AgentSettingsProps {
  providers: AgentProviderSetting[];
  tools: AgentToolSetting[];
}

export function AgentSettings({ providers, tools }: AgentSettingsProps) {
  const [localProviders, setLocalProviders] = useState(providers);
  const [localTools, setLocalTools] = useState(tools);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleProvider = (provider: AgentProviderSetting) => {
    const enabled = !provider.enabled;
    setLocalProviders((current) =>
      current.map((item) =>
        item.provider_key === provider.provider_key ? { ...item, enabled } : item
      )
    );
    setError(null);
    startTransition(async () => {
      try {
        await setAgentProviderEnabled(provider.provider_key, enabled);
      } catch {
        setError("Could not update that provider.");
        setLocalProviders(providers);
      }
    });
  };

  const markAiDexAvailable = (tool: AgentToolSetting) => {
    setLocalTools((current) =>
      current.map((item) =>
        item.tool_key === tool.tool_key ? { ...item, status: "available" } : item
      )
    );
    setError(null);
    startTransition(async () => {
      try {
        await setAgentToolStatus(tool.tool_key, "available");
      } catch {
        setError("Could not update that tool.");
        setLocalTools(tools);
      }
    });
  };

  return (
    <div className="overflow-hidden rounded-md border border-border bg-bg-card">
      <div className="flex flex-col gap-2 border-b border-border bg-bg-secondary px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">
            Agent Connections
          </h2>
          <p className="mt-0.5 text-xs text-text-tertiary">
            Enable providers and required tools for WorkOS AI teammates.
          </p>
        </div>
        {error && (
          <div className="rounded-md border border-border bg-bg-card px-2 py-1 text-xs text-text-secondary">
            {error}
          </div>
        )}
      </div>

      <section className="border-b border-border">
        <div className="flex items-center gap-2 px-4 py-3">
          <Bot className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text-primary">Providers</h3>
        </div>
        <div className="divide-y divide-border">
          {localProviders.map((provider) => (
            <div
              key={provider.provider_key}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium text-text-primary">
                  {provider.label}
                </div>
                <div className="text-xs text-text-tertiary">
                  {provider.enabled ? "Enabled" : "Disabled"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleProvider(provider)}
                disabled={pending}
                className="rounded-md p-1 text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                aria-label={`${provider.enabled ? "Disable" : "Enable"} ${
                  provider.label
                }`}
              >
                {provider.enabled ? (
                  <ToggleRight className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <ToggleLeft className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 px-4 py-3">
          <PlugZap className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text-primary">Tools</h3>
        </div>
        <div className="divide-y divide-border">
          {localTools.map((tool) => (
            <div
              key={tool.tool_key}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium text-text-primary">
                  {tool.label}
                </div>
                <div className="text-xs text-text-tertiary">
                  Status: {tool.status}
                </div>
              </div>
              <button
                type="button"
                onClick={() => markAiDexAvailable(tool)}
                disabled={pending || tool.status === "available"}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Mark available
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
