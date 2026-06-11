import type { ReactNode } from "react";
import { SettingsTabs } from "@/components/settings-tabs";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <main className="h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header>
          <div className="section-label">Admin</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">
            Settings
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Configure AI teammates, collaboration standards, and workspace-level
            behavior.
          </p>
        </header>

        <SettingsTabs />
        {children}
      </div>
    </main>
  );
}
