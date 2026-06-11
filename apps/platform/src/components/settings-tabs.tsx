"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_SECTIONS } from "@/lib/settings-nav";

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <div className="shrink-0 overflow-x-auto border-b border-border">
      <div role="tablist" aria-label="Settings sections" className="flex gap-0">
        {SETTINGS_SECTIONS.map((section) => {
          const active = pathname === section.href;
          return (
            <Link
              key={section.href}
              href={section.href}
              role="tab"
              aria-selected={active}
              className={[
                "border-b-2 -mb-px whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
                active
                  ? "border-accent text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary",
              ].join(" ")}
            >
              {section.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
