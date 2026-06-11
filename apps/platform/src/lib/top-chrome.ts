export const TOP_CHROME_COLLAPSED_KEY = "workos-top-chrome-collapsed";

export function parseTopChromeCollapsed(value: string | null): boolean {
  return value === "1";
}

export function formatTopChromeCollapsed(collapsed: boolean): "1" | "0" {
  return collapsed ? "1" : "0";
}

export function getTopChromeToggleLabel(collapsed: boolean): string {
  return collapsed ? "Expand top chrome" : "Collapse top chrome";
}
