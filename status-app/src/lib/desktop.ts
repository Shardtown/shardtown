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

/* ─── Onboarding completion flag ─────────────────────────────────────── */

/**
 * Read whether the user has already gone through (or dismissed) the
 * onboarding tour. Backed by a file in Application Support so it survives
 * unsigned-build updates and webview localStorage wipes.
 *
 * Falls back to localStorage in web mode (or when the IPC isn't ready
 * yet) so legacy paths keep working.
 */
export async function onboardingDone(): Promise<boolean> {
  if (!IS_DESKTOP) {
    try { return localStorage.getItem("shardtown.onboarding.v2") === "done"; } catch { return false; }
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("onboarding_get");
  } catch {
    try { return localStorage.getItem("shardtown.onboarding.v2") === "done"; } catch { return false; }
  }
}

export async function setOnboardingDone(done: boolean): Promise<void> {
  // Always write the localStorage too — keeps the legacy gate working in
  // web mode and during the IPC bootstrap.
  try {
    if (done) localStorage.setItem("shardtown.onboarding.v2", "done");
    else localStorage.removeItem("shardtown.onboarding.v2");
  } catch { /* */ }
  if (!IS_DESKTOP) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke<void>("onboarding_set", { done });
  } catch { /* */ }
}

/* ─── Biometric confirmation ──────────────────────────────────────────── */

/**
 * Prompts the user with the macOS Touch ID system dialog. Returns true if
 * the user authenticated successfully, false if they cancelled or biometry
 * isn't available. In web mode the prompt is bypassed (returns true) — the
 * caller stays in charge of any web-side confirm() they need.
 */
export async function biometricConfirm(reason: string): Promise<boolean> {
  if (!IS_DESKTOP) return true;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("biometric_confirm", { reason });
  } catch {
    // No biometry hardware / not enrolled — fail open so the user can still
    // operate the app on a Mac without Touch ID.
    return true;
  }
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

/* ─── Auto-updater ────────────────────────────────────────────────────── */

export interface UpdateInfo {
  /** New version string declared by the manifest (e.g. "0.1.2"). */
  version: string;
  /** Date string from the manifest (ISO). May be empty. */
  date?: string;
  /** Release notes / "what's new" text from the manifest. */
  notes?: string;
}

export type UpdateProgress =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; info: UpdateInfo }
  | { kind: "none" }
  | { kind: "downloading"; downloaded: number; total: number | null }
  | { kind: "installing" }
  | { kind: "error"; message: string };

/**
 * Polls the public update manifest. Returns `UpdateInfo` if the manifest
 * declares a version newer than the running app, or null otherwise.
 *
 * The endpoint, public key and signature verification are all configured in
 * `tauri.conf.json` → `plugins.updater`. The Tauri updater plugin handles
 * the actual signature check — we just surface the result.
 *
 * In web mode (or if the plugin isn't loaded) this resolves to `null`.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!IS_DESKTOP) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const u = await check();
    if (!u) return null;
    return {
      version: u.version,
      date: u.date,
      notes: u.body,
    };
  } catch (e) {
    // Network down, bad manifest, signature mismatch — all considered "no
    // update" from the user's perspective. The caller can re-check later.
    console.warn("[updater] check failed:", e);
    return null;
  }
}

/**
 * Runs the full download-verify-install-relaunch flow. Reports progress via
 * the `onProgress` callback. Throws if anything fails (signature mismatch,
 * network drop mid-download, …) — the caller should show an error toast.
 */
export async function downloadAndInstallUpdate(
  onProgress?: (p: UpdateProgress) => void,
): Promise<boolean> {
  if (!IS_DESKTOP) return false;
  const { check } = await import("@tauri-apps/plugin-updater");
  const { relaunch } = await import("@tauri-apps/plugin-process");

  onProgress?.({ kind: "checking" });
  const u = await check();
  if (!u) {
    onProgress?.({ kind: "none" });
    return false;
  }

  let downloaded = 0;
  let total: number | null = null;

  await u.downloadAndInstall(evt => {
    switch (evt.event) {
      case "Started":
        total = evt.data.contentLength ?? null;
        downloaded = 0;
        onProgress?.({ kind: "downloading", downloaded, total });
        break;
      case "Progress":
        downloaded += evt.data.chunkLength;
        onProgress?.({ kind: "downloading", downloaded, total });
        break;
      case "Finished":
        onProgress?.({ kind: "installing" });
        break;
    }
  });

  // Tauri replaces the .app on disk; relaunch the freshly installed binary.
  await relaunch();
  return true;
}
