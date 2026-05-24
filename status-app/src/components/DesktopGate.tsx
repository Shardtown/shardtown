import { useEffect, useState, type ReactNode } from "react";
import { Loader2, KeyRound, ExternalLink } from "lucide-react";
import { IS_DESKTOP, tokenGet, tokenSet, openExternal, onboardingDone, onDeepLink } from "@/lib/desktop";
import { apiGet, apiPost, ApiError, setBearerToken } from "@/api/client";
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

type OAuthProvider = "discord" | "google" | "github";

// Stored in localStorage between "user opens browser for OAuth" and
// "OS launches/focuses app with the shardtwn:// deep link". If the user
// quits or the WebView reloads in between we'd otherwise lose the
// verifier and fail PKCE validation. Cleared on success or error.
const PKCE_STORAGE_KEY = "shardtwn.oauth.verifier";

function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  const verifier = base64urlEncode(buf);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64urlEncode(new Uint8Array(digest)) };
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
  const [oauthBusy, setOauthBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(reason ?? null);

  // Listen for `shardtwn://auth/callback?code=…` deep links — the
  // browser-side OAuth flow ends with the provider's callback redirecting
  // the OS to that URL, which brings the Tauri app to the foreground and
  // hands us the auth code. We exchange it for a Bearer token using the
  // PKCE verifier we stashed when starting the flow.
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let cancelled = false;

    onDeepLink(async rawUrl => {
      try {
        const u = new URL(rawUrl);
        if (u.protocol !== "shardtwn:") return;
        if (u.host !== "auth" || !u.pathname.startsWith("/callback")) return;

        const err = u.searchParams.get("error");
        if (err) {
          setOauthBusy(null);
          setError(`OAuth interrompu (${err}).`);
          return;
        }
        const code = u.searchParams.get("code");
        const verifier = localStorage.getItem(PKCE_STORAGE_KEY);
        if (!code || !verifier) return;

        try {
          const res = await apiPost<{ token: string }>("/api/mobile/auth/exchange", {
            code,
            code_verifier: verifier,
          });
          if (!res.token) throw new Error("Pas de token");
          setBearerToken(res.token);
          await apiGet<unknown>("/api/account/me");
          await tokenSet(res.token);
          disableDemoMode();
          localStorage.removeItem(PKCE_STORAGE_KEY);
          setOauthBusy(null);
          onSuccess();
        } catch (e) {
          setBearerToken(null);
          localStorage.removeItem(PKCE_STORAGE_KEY);
          setOauthBusy(null);
          setError(e instanceof Error ? e.message : "Échec de l'échange OAuth.");
        }
      } catch (e) {
        console.warn("[desktop-oauth] parse failed:", rawUrl, e);
      }
    }).then(unlisten => {
      if (cancelled) unlisten();
      else cleanup = unlisten;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [onSuccess]);

  async function startOAuth(provider: OAuthProvider) {
    if (oauthBusy) return;
    setError(null);
    setOauthBusy(provider);
    try {
      const { verifier, challenge } = await generatePKCE();
      localStorage.setItem(PKCE_STORAGE_KEY, verifier);
      const url = `https://shardtwn.fr/api/mobile/auth/start/${provider}?code_challenge=${encodeURIComponent(challenge)}&scheme=shardtwn`;
      await openExternal(url);
    } catch (e) {
      localStorage.removeItem(PKCE_STORAGE_KEY);
      setOauthBusy(null);
      setError(e instanceof Error ? e.message : "Impossible d'ouvrir le navigateur.");
    }
  }

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
              disabled={busy || !!oauthBusy || !token.trim()}
              className="dl-cta"
            >
              {busy
                ? <><Loader2 size={14} strokeWidth={2.4} className="animate-spin" /> Vérification…</>
                : <><KeyRound size={14} strokeWidth={2.4} /> Continuer</>}
            </button>

            <div className="dl-divider"><span>ou continuer avec</span></div>

            <div className="dl-oauth-row">
              <OAuthIconButton
                provider="discord"
                label="Discord"
                onClick={() => startOAuth("discord")}
                busy={oauthBusy === "discord"}
                disabled={!!oauthBusy && oauthBusy !== "discord"}
              />
              <OAuthIconButton
                provider="google"
                label="Google"
                onClick={() => startOAuth("google")}
                busy={oauthBusy === "google"}
                disabled={!!oauthBusy && oauthBusy !== "google"}
              />
              <OAuthIconButton
                provider="github"
                label="GitHub"
                onClick={() => startOAuth("github")}
                busy={oauthBusy === "github"}
                disabled={!!oauthBusy && oauthBusy !== "github"}
              />
            </div>

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

function OAuthIconButton({
  provider, label, onClick, busy, disabled,
}: {
  provider: OAuthProvider;
  label: string;
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="dl-oauth-btn"
      aria-label={`Continuer avec ${label}`}
      title={`Continuer avec ${label}`}
    >
      {busy ? <Loader2 size={16} strokeWidth={2.4} className="animate-spin" /> : <OAuthGlyph provider={provider} />}
    </button>
  );
}

function OAuthGlyph({ provider }: { provider: OAuthProvider }) {
  if (provider === "discord") {
    return (
      <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden>
        <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.974 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    );
  }
  if (provider === "google") {
    return (
      <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden>
        <path d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.28 1.4-1.1 2.6-2.34 3.41v2.85h3.78c2.21-2.03 3.49-5.04 3.49-8.5z" fill="#4285F4"/>
        <path d="M12 24c3.16 0 5.81-1.04 7.74-2.83l-3.78-2.85c-1.05.7-2.39 1.13-3.96 1.13-3.04 0-5.62-2.05-6.54-4.82H1.55v2.94C3.47 21.31 7.42 24 12 24z" fill="#34A853"/>
        <path d="M5.46 14.63c-.23-.7-.36-1.44-.36-2.21s.13-1.51.36-2.21V7.27H1.55C.76 8.79.3 10.34.3 12s.46 3.21 1.25 4.73l3.91-2.1z" fill="#FBBC05"/>
        <path d="M12 4.75c1.71 0 3.25.59 4.46 1.74l3.34-3.34C17.81.99 15.16 0 12 0 7.42 0 3.47 2.69 1.55 6.59l3.91 3.04C6.38 6.8 8.96 4.75 12 4.75z" fill="#EA4335"/>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2.01-3.2.69-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.08-.12-.29-.51-1.47.11-3.05 0 0 .97-.31 3.18 1.18a11.07 11.07 0 0 1 5.8 0c2.2-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.76.11 3.05.74.8 1.18 1.82 1.18 3.08 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.67.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z"/>
    </svg>
  );
}
