"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";

export type ThemeToggleIcon = "moon" | "sun";

export function getThemeTogglePresentation(resolvedTheme: "light" | "dark") {
  if (resolvedTheme === "dark") {
    return {
      nextTheme: "light" as const,
      icon: "sun" as ThemeToggleIcon,
      ariaLabel: "Switch to light mode",
      className:
        "inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--theme-toggle-border)] bg-[var(--theme-toggle-bg)] text-[var(--theme-toggle-fg)] shadow-sm transition-colors hover:bg-[var(--theme-toggle-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    };
  }

  return {
    nextTheme: "dark" as const,
    icon: "moon" as ThemeToggleIcon,
    ariaLabel: "Switch to dark mode",
    className:
      "inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--theme-toggle-border)] bg-[var(--theme-toggle-bg)] text-[var(--theme-toggle-fg)] shadow-sm transition-colors hover:bg-[var(--theme-toggle-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
  };
}

export function ThemeToggle() {
  const { resolvedTheme, toggle } = useTheme();
  const presentation = getThemeTogglePresentation(resolvedTheme);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={presentation.ariaLabel}
      className={presentation.className}
    >
      {presentation.icon === "sun" ? (
        <Sun size={16} strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <Moon size={16} strokeWidth={1.8} aria-hidden="true" />
      )}
    </button>
  );
}
