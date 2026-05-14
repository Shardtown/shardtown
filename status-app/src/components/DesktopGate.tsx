import { useEffect, useState, type ReactNode } from "react";
import { Loader2, KeyRound, ExternalLink } from "lucide-react";
import { IS_DESKTOP, tokenGet, tokenSet, openExternal, onboardingDone } from "@/lib/desktop";
import { apiGet, ApiError, setBearerToken } from "@/api/client";
import { shouldShowOnboarding, startTour } from "@/components/OnboardingTour.api";
import { AuroraBackground } from "@/components/AuroraBackground";
import { DEMO_TOKEN, isDemoToken, enableDemoMode, disableDemoMode } from "@/lib/demo";
import { shouldRevalidate, setLastValidated } from "@/lib/tokenReval";
import { useAuth } from "@/api/auth";

type State =
  | { kind: "boot" }
  | { kind: "login"; reason?: string }
  | { kind: "ready" };

// Total intro length, including the staggered entrance of the logo,
// wordmark and dots. The app always waits at least this long before
// swapping the boot screen out — even when /api/account/me answers
// instantly — so the splash feels deliberate, like a software intro.
const INTRO_MS = 2800;

// Crossfade duration when leaving the boot screen — needs to match the
// leaving CSS animation in BootScreen / entering animation on the next view.
const TRANSITION_MS = 480;

/**
 * Wraps the SPA when running inside Tauri. Reads the keychain on boot,
 * validates the token by hitting /api/account/me, then either renders the
 * children (logged-in app) or shows the PAT login screen. In web mode it
 * renders children immediately — the regular cookie-auth flow handles
 * everything from there.
 */
export function DesktopGate({ children }: { children: ReactNode }) {
  const { refresh: refreshAuth } = useAuth();
  const [state, setState] = useState<State>(IS_DESKTOP ? { kind: "boot" } : { kind: "ready" });
  // Tracks the boot-screen leave animation. While true we keep BootScreen
  // mounted with the `boot-leaving` class so it can fade out gracefully on
  // top of the incoming login/dashboard.
  const [bootLeaving, setBootLeaving] = useState(false);
  useEffect(() => {
    if (!IS_DESKTOP) return;
    let cancelled = false;
    // Soft launch chime (~120ms in to align with the logo settling). One
    // shot, fire-and-forget; if autoplay is blocked by WebView policy we
    // just stay silent instead of erroring out.
    // Fire the launch sound immediately so its 600ms pre-rise builds
    // anticipation while the logo card scales in (700ms animation), and
    // the sub-bass impact lands ~100ms before the logo settles.
    try {
      const audio = new Audio("/sounds/shardtown-launch.wav");
      audio.volume = 0.6;
      audio.play().catch(() => {});
    } catch { /* */ }
    // The intro plays in full, regardless of how fast the auth check
    // resolves. Treat it as a brand moment, not a load indicator.
    const introDone = new Promise<void>(r => setTimeout(r, INTRO_MS));
    (async () => {
      // Sync the persistent "onboarding done" flag from disk into localStorage
      // BEFORE we check shouldShowOnboarding() below. The file in
      // ~/Library/Application Support survives unsigned-build updates and
      // webview localStorage wipes; without this sync, every update would
      // re-launch the tour.
      try {
        if (await onboardingDone()) {
          localStorage.setItem("shardtown.onboarding.v2", "done");
        }
      } catch { /* */ }

      const token = await tokenGet().catch(() => null);
      let next: State;
      if (!token) {
        next = { kind: "login" };
      } else if (isDemoToken(token)) {
        // Demo magic — skip the /api/account/me validation entirely
        // since there's no network involved. Auto-enables demo mode
        // even if localStorage was wiped between launches.
        enableDemoMode();
        setBearerToken(token);
        next = { kind: "ready" };
      } else {
        setBearerToken(token);
        // Respect the user's "Sécurité du token" preference. Default is
        // "never" — we trust the keychain blindly so updates / reinstalls
        // don't kick the user back to the login screen. Only re-hit the
        // server when the configured window has lapsed.
        if (shouldRevalidate()) {
          try {
            await apiGet<unknown>("/api/account/me");
            setLastValidated(Date.now());
            next = { kind: "ready" };
          } catch (err) {
            // Network down → assume the token is still good (offline-first).
            // Only forcibly send back to login on an explicit 401.
            if (err instanceof ApiError && err.status === 401) {
              setBearerToken(null);
              next = { kind: "login", reason: "Token expiré ou révoqué." };
            } else {
              next = { kind: "ready" };
            }
          }
        } else {
          next = { kind: "ready" };
        }
      }
      await introDone;
      if (cancelled) return;

      // Begin the crossfade: swap the underlying screen now (so it can mount
      // and play its enter animation), but keep BootScreen layered on top
      // with the leaving class for TRANSITION_MS, then unmount it.
      // Trigger an AuthContext refresh right before the dashboard mounts so
      // the user profile (avatar + name) is in place by the time the hero
      // renders — otherwise the first paint reads "Salut, ami." with no pdp.
      if (next.kind === "ready") {
        refreshAuth();
      }
      setState(next);
      setBootLeaving(true);
      setTimeout(() => { if (!cancelled) setBootLeaving(false); }, TRANSITION_MS);
      // When landing on the dashboard for the first time, surface the
      // onboarding tour. Delayed past the boot crossfade so it doesn't
      // overlap with the leaving boot screen, and past router mount so
      // TourHost (inside DesktopShell) is listening for the event.
      if (next.kind === "ready" && shouldShowOnboarding()) {
        setTimeout(() => { if (!cancelled) startTour(); }, TRANSITION_MS + 450);
      }
    })();
    return () => { cancelled = true; };
    // refreshAuth comes from the auth context and is stable for the
    // lifetime of the provider; intentionally empty deps so the boot
    // sequence runs exactly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {state.kind === "boot" && <BootScreen />}
      {state.kind === "login" && (
        <DesktopLogin
          reason={state.reason}
          onSuccess={() => {
            // Re-hit /api/me so the AuthContext picks up the new user behind
            // the freshly stored bearer token — otherwise the dashboard
            // greets "Salut, ami." with no avatar.
            refreshAuth();
            setState({ kind: "ready" });
            // First-time setup: pop the tour right after login if not done.
            if (shouldShowOnboarding()) {
              setTimeout(() => startTour(), 800);
            }
          }}
        />
      )}
      {state.kind === "ready" && <>{children}</>}
      {/* Boot leaves on top with a fade/scale-out so the swap reads as one
          fluid motion instead of a hard cut. */}
      {bootLeaving && <BootScreen leaving />}
    </>
  );
}

function BootScreen({ leaving = false }: { leaving?: boolean }) {
  return (
    <>
      <div className="fixed inset-x-0 top-0 h-7 z-50" data-tauri-drag-region />
      <div className={`boot-stage ${leaving ? "boot-stage-leaving" : ""}`}>
        <AuroraBackground />
        <div className="boot-stack" style={{ position: "relative", zIndex: 1 }}>
          <div className="boot-logo">
            <div className="boot-logo-card">
              <img src="/logo.png" alt="" />
            </div>
          </div>

          <p className="boot-wordmark">Shardtown</p>

          <div className="boot-dots" aria-label="Chargement">
            <span /><span /><span />
          </div>
        </div>
      </div>
    </>
  );
}

function DesktopLogin({
  reason,
  onSuccess,
}: {
  reason?: string;
  onSuccess: () => void;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(reason ?? null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith("jr_")) {
      setError("Format invalide. Le token commence par jr_.");
      return;
    }
    setBusy(true);
    setError(null);
    // Demo mode bypasses the backend entirely — mock responses are served
    // by lib/demo.ts. Lets users try the app fully offline.
    if (isDemoToken(trimmed)) {
      enableDemoMode();
      setBearerToken(trimmed);
      await tokenSet(trimmed);
      setBusy(false);
      onSuccess();
      return;
    }
    // Anyone running with a previously enabled demo flag who now types a
    // real token should fall out of demo mode.
    disableDemoMode();
    try {
      setBearerToken(trimmed);
      // Validate before persisting — never write a bad token to the keychain.
      await apiGet<unknown>("/api/account/me");
      await tokenSet(trimmed);
      onSuccess();
    } catch (err) {
      setBearerToken(null);
      const msg = err instanceof ApiError
        ? (err.status === 401 ? "Token invalide ou révoqué." : err.message)
        : "Connexion impossible.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-x-0 top-0 h-7 z-50" data-tauri-drag-region />
      <div className="dl-stage">
        {/* Aurora drift — same DNA as the boot splash so the transition
            from boot → login reads as one continuous environment. */}
        <div className="dl-aurora">
          <div className="dl-blob b1"></div>
          <div className="dl-blob b2"></div>
          <div className="dl-blob b3"></div>
          <div className="dl-blob b4"></div>
        </div>
        <div className="dl-vignette"></div>

        <div className="dl-content">
          {/* Brand block — massive wordmark, mirrors the splash */}
          <div className="dl-brand">
            <p className="dl-label">Studio</p>
            <h1 className="dl-wordmark">SHARDTOWN</h1>
            <p className="dl-tag">Connecte ton compte pour accéder à l'environnement.</p>
          </div>

          {/* Glass card hosting the actual token form */}
          <form onSubmit={submit} className="dl-card">
            <label className="dl-field-label" htmlFor="dl-token-input">
              Token d'accès personnel
            </label>
            <input
              id="dl-token-input"
              autoFocus
              type="password"
              value={token}
              placeholder="jr_…"
              onChange={e => setToken(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="dl-input"
            />
            {error && (
              <div className="dl-error" role="alert">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy || !token.trim()}
              className="dl-cta"
            >
              {busy
                ? <><Loader2 size={14} strokeWidth={2.4} className="animate-spin" /> Vérification…</>
                : <><KeyRound size={14} strokeWidth={2.4} /> Continuer</>}
            </button>

            <div className="dl-divider"><span>ou</span></div>

            <button
              type="button"
              onClick={() => openExternal("https://shardtwn.fr/account")}
              className="dl-link"
            >
              Générer un token sur shardtwn.fr <ExternalLink size={12} strokeWidth={2} />
            </button>

            <button
              type="button"
              onClick={() => setToken(DEMO_TOKEN)}
              className="dl-demo"
              title="Mode démo offline — pré-remplit la clé de test"
            >
              Pas encore de compte ? Essaie le mode démo
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
