/**
 * Theme switcher for the desktop app — dark (default) and light. The
 * current theme writes a `data-theme="light"` attribute on <html>; CSS
 * lives in index.css under [data-theme="light"] selectors that override
 * the dark defaults.
 *
 * Persisted in localStorage so the choice survives reloads. The DesktopShell
 * has a small toggle button next to the brand wordmark.
 */

export type Theme = "dark" | "light";

const STORAGE_KEY = "shardtown.theme";

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch { /* */ }
  return "dark";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export function setTheme(theme: Theme) {
  applyTheme(theme);
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* */ }
}

export function toggleTheme(): Theme {
  const next: Theme = getStoredTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
