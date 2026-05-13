const STORAGE_KEY = "shardtown.onboarding.v2";
export const ONBOARDING_EVENT_NAME = "shardtown:start-tour";

export function shouldShowOnboarding(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== "done"; } catch { return false; }
}

/**
 * Mark the tour as done in BOTH localStorage (immediate, sync) and the
 * Application-Support file (survives unsigned-build updates that may wipe
 * the WKWebView localStorage). The file write is fire-and-forget so the UI
 * doesn't stall on it.
 */
export function markOnboardingComplete() {
  try { localStorage.setItem(STORAGE_KEY, "done"); } catch { /* */ }
  // Lazy import to dodge a circular dep and keep web-mode bundles light.
  import("@/lib/desktop").then(({ setOnboardingDone }) => {
    setOnboardingDone(true).catch(() => { /* */ });
  }).catch(() => { /* */ });
}

export function startTour() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ONBOARDING_EVENT_NAME));
}
