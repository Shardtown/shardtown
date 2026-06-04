/**
 * Theme switcher pour l'app desktop. Trois thèmes :
 * - "aurora" (défaut) : gradient animé multicolore en arrière-plan du shell.
 * - "noir" : noir pur, sans gradient, surface plate type "OLED".
 * - "light" : palette claire (data-theme="light").
 *
 * Le thème courant écrit un `data-theme` sur <html> (sauf aurora qui est la
 * valeur par défaut sans attribut). Les overrides CSS vivent dans index.css.
 * `setTheme` dispatch un évènement `shardtown:theme-change` pour que le
 * DesktopShell puisse cacher l'animation quand on n'est pas en aurora.
 */

import { useEffect, useState } from "react";

export type Theme = "aurora" | "noir" | "light";

const STORAGE_KEY = "shardtown.theme";
const EVENT = "shardtown:theme-change";

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "aurora" || v === "noir" || v === "light") return v;
    // Migration : ancien "dark" → "aurora" (qui inclut le gradient)
    if (v === "dark") return "aurora";
  } catch { /* */ }
  return "aurora";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "aurora") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

export function setTheme(theme: Theme) {
  applyTheme(theme);
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* */ }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<Theme>(EVENT, { detail: theme }));
  }
}

/** Hook React : renvoie le thème courant et se met à jour à chaque setTheme. */
export function useTheme(): Theme {
  const [theme, setLocal] = useState<Theme>(getStoredTheme);
  useEffect(() => {
    const onChange = (e: Event) => {
      const t = (e as CustomEvent<Theme>).detail;
      if (t === "aurora" || t === "noir" || t === "light") setLocal(t);
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return theme;
}
