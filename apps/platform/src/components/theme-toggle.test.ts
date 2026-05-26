import assert from "node:assert/strict";
import { getThemeTogglePresentation } from "./theme-toggle";

const lightMode = getThemeTogglePresentation("light");
assert.equal(lightMode.nextTheme, "dark");
assert.equal(lightMode.icon, "moon");
assert.equal(lightMode.ariaLabel, "Switch to dark mode");
assert.match(lightMode.className, /bg-\[var\(--theme-toggle-bg\)\]/);
assert.match(lightMode.className, /text-\[var\(--theme-toggle-fg\)\]/);

const darkMode = getThemeTogglePresentation("dark");
assert.equal(darkMode.nextTheme, "light");
assert.equal(darkMode.icon, "sun");
assert.equal(darkMode.ariaLabel, "Switch to light mode");
assert.match(darkMode.className, /bg-\[var\(--theme-toggle-bg\)\]/);
assert.match(darkMode.className, /text-\[var\(--theme-toggle-fg\)\]/);
