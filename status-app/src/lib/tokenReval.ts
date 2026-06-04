/**
 * Token revalidation preference.
 *
 * The desktop app stores the user's PAT in the macOS Keychain, it survives
 * across app launches and across `.app` reinstalls (so updates don't lose
 * the session). By default we *trust the keychain forever*: no network call
 * at boot to re-validate the token. The user can change that here:
 *
 *   - "never"   (default), never re-check, trust the keychain blindly.
 *   - "launch"           , re-validate on every cold boot (legacy behavior).
 *   - "30d"              , re-validate at most once every 30 days.
 *   - "90d"              , re-validate at most once every 90 days.
 *
 * When the chosen interval lapses the next boot triggers `/api/account/me`;
 * on success the timer resets, on 401 the user gets sent back to login.
 *
 * Persisted in localStorage, wiped if the user clears it, which simply
 * falls back to the "never" default.
 */

const MODE_KEY  = "shardtown.token.reval-mode.v1";
const STAMP_KEY = "shardtown.token.last-validated.v1";

export type RevalMode = "never" | "launch" | "30d" | "90d";

const VALID_MODES: RevalMode[] = ["never", "launch", "30d", "90d"];

export function getRevalMode(): RevalMode {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (raw && (VALID_MODES as string[]).includes(raw)) return raw as RevalMode;
  } catch { /* */ }
  return "never";
}

export function setRevalMode(mode: RevalMode): void {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* */ }
}

export function getLastValidated(): number | null {
  try {
    const raw = localStorage.getItem(STAMP_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

export function setLastValidated(ms: number): void {
  try { localStorage.setItem(STAMP_KEY, String(ms)); } catch { /* */ }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Returns true if a fresh `/api/account/me` call should run at boot, given
 * the current mode + last validation timestamp.
 *
 *   - never        → false (always trust)
 *   - launch       → true  (every cold boot)
 *   - 30d / 90d    → true only if the last stamp is older than the window
 *                    (or there was no stamp at all)
 */
export function shouldRevalidate(now = Date.now()): boolean {
  const mode = getRevalMode();
  if (mode === "never")  return false;
  if (mode === "launch") return true;
  const window = mode === "30d" ? 30 * DAY_MS : 90 * DAY_MS;
  const last = getLastValidated();
  if (last === null) return true;
  return now - last > window;
}

export function describeMode(mode: RevalMode): string {
  switch (mode) {
    case "never":  return "Jamais, l'app fait confiance au Keychain en permanence";
    case "launch": return "À chaque lancement de l'app";
    case "30d":    return "Tous les 30 jours";
    case "90d":    return "Tous les 90 jours";
  }
}
