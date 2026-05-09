/**
 * Desktop (Tauri) detection + token-store bridge.
 *
 * The same `status-app` SPA serves both the web at shardtwn.fr (cookie auth)
 * and the macOS Tauri app (Bearer auth). This module is the only place that
 * touches Tauri APIs — everywhere else we treat it as a thin "is desktop?"
 * boolean and let the API client switch transports.
 *
 * Tauri 2 exposes `__TAURI_INTERNALS__` on the window object as soon as the
 * webview boots, so detection is synchronous. The actual Tauri JS APIs are
 * loaded lazily via dynamic import to keep them out of the web bundle.
 */

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export const IS_DESKTOP = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

/**
 * Production API origin — desktop targets it directly since the SPA loads
 * from `tauri://localhost` (different origin from the API). Web stays on
 * relative paths so dev/preview/prod all just work.
 */
export const API_BASE = IS_DESKTOP ? "https://shardtwn.fr" : "";

/* ─── Token store ─────────────────────────────────────────────────────── */

export async function tokenGet(): Promise<string | null> {
  if (!IS_DESKTOP) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("token_get");
}

export async function tokenSet(token: string): Promise<void> {
  if (!IS_DESKTOP) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke<void>("token_set", { token });
}

export async function tokenClear(): Promise<void> {
  if (!IS_DESKTOP) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke<void>("token_clear");
}

/* ─── External link opener ────────────────────────────────────────────── */

/**
 * Opens a URL — either through Tauri's shell plugin (so it goes to Safari
 * instead of the embedded webview) or via window.open in web mode.
 */
export async function openExternal(url: string): Promise<void> {
  if (IS_DESKTOP) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
    return;
  }
  window.open(url, "_blank", "noopener");
}
