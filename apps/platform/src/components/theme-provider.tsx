"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (value: ThemePreference) => void;
  toggle: () => void;
}

const STORAGE_KEY = "workos-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(pref: ThemePreference): ResolvedTheme {
  const resolved: ResolvedTheme =
    pref === "system" ? getSystemTheme() : pref;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const stored = (typeof window !== "undefined"
        ? localStorage.getItem(STORAGE_KEY)
        : null) as ThemePreference | null;
      const initial: ThemePreference = stored ?? "system";
      setThemeState(initial);
      setResolvedTheme(applyTheme(initial));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setResolvedTheme(applyTheme("system"));
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((value: ThemePreference) => {
    setThemeState(value);
    setResolvedTheme(applyTheme(value));
    if (value === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, value);
    }
  }, []);

  const toggle = useCallback(() => {
    const next: ThemePreference = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

/**
 * FOUC-safe inline script: runs synchronously before React hydrates so the
 * correct theme class is on <html> before first paint. Must stay JS-only
 * and tiny.
 */
export const themeInitScript = `
(function(){try{
var k='workos-theme';
var s=localStorage.getItem(k);
var d=s==='dark'||(!s&&matchMedia('(prefers-color-scheme: dark)').matches);
var c=document.documentElement.classList;
c.remove('light','dark');
c.add(d?'dark':'light');
}catch(e){}})();
`;
