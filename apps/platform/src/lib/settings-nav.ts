export interface SettingsSection {
  href: string;
  label: string;
  description: string;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    href: "/settings/agents",
    label: "Agents",
    description: "Provider connections, model defaults, and agent tools.",
  },
  {
    href: "/settings/ai-standards",
    label: "AI Standards",
    description: "Universal collaboration and output standards for AI teammates.",
  },
  {
    href: "/settings/sources",
    label: "Sources",
    description: "Imported chats, visibility, and context suggestion controls.",
  },
];

export const DEFAULT_SETTINGS_PATH = SETTINGS_SECTIONS[0].href;

export function isSettingsPathActive(pathname: string): boolean {
  return pathname === "/settings" || pathname.startsWith("/settings/");
}
