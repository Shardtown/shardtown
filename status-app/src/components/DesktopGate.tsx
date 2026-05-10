import { useEffect, useState, type ReactNode } from "react";
import { Loader2, KeyRound, ExternalLink } from "lucide-react";
import { IS_DESKTOP, tokenGet, tokenSet, openExternal } from "@/lib/desktop";
import { apiGet, ApiError, setBearerToken } from "@/api/client";
import { OnboardingTour, shouldShowOnboarding } from "@/components/OnboardingTour";
import { DEMO_TOKEN, isDemoToken, enableDemoMode, disableDemoMode } from "@/lib/demo";

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
  const [state, setState] = useState<State>(IS_DESKTOP ? { kind: "boot" } : { kind: "ready" });
  // Tracks the boot-screen leave animation. While true we keep BootScreen
  // mounted with the `boot-leaving` class so it can fade out gracefully on
  // top of the incoming login/dashboard.
  const [bootLeaving, setBootLeaving] = useState(false);
  // First-launch onboarding — flagged once and never again.
  const [showOnboarding, setShowOnboarding] = useState(false);

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
      const token = await tokenGet().catch(() => null);
      let next: State;
      if (!token) {
        next = { kind: "login" };
      } else {
        setBearerToken(token);
        try {
          await apiGet<unknown>("/api/account/me");
          next = { kind: "ready" };
        } catch (err) {
          setBearerToken(null);
          const reason = err instanceof ApiError && err.status === 401
            ? "Token expiré ou révoqué."
            : "Connexion impossible. Vérifie ton réseau.";
          next = { kind: "login", reason };
        }
      }
      await introDone;
      if (cancelled) return;

      // Begin the crossfade: swap the underlying screen now (so it can mount
      // and play its enter animation), but keep BootScreen layered on top
      // with the leaving class for TRANSITION_MS, then unmount it.
      setState(next);
      setBootLeaving(true);
      setTimeout(() => { if (!cancelled) setBootLeaving(false); }, TRANSITION_MS);
      // When landing on the dashboard for the first time, surface the
      // onboarding tour. Delayed past the boot crossfade so it doesn't
      // overlap with the leaving boot screen.
      if (next.kind === "ready" && shouldShowOnboarding()) {
        setTimeout(() => { if (!cancelled) setShowOnboarding(true); }, TRANSITION_MS + 250);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      {state.kind === "boot" && <BootScreen />}
      {state.kind === "login" && (
        <DesktopLogin
          reason={state.reason}
          onSuccess={() => {
            setState({ kind: "ready" });
            // First-time setup: pop the tour right after login if not done.
            if (shouldShowOnboarding()) {
              setTimeout(() => setShowOnboarding(true), 600);
            }
          }}
        />
      )}
      {state.kind === "ready" && <>{children}</>}
      {state.kind === "ready" && IS_DESKTOP && showOnboarding && (
        <OnboardingTour onClose={() => setShowOnboarding(false)} />
      )}
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
        <div className="boot-stack">
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

        <style>{`
          .boot-stage {
            position: fixed;
            inset: 0;
            z-index: 200;
            background: radial-gradient(ellipse at 50% 30%, #11131a 0%, #0a0b0e 60%, #050507 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            color: #fff;
            transition: opacity 480ms ease-out;
          }
          .boot-stage-leaving {
            pointer-events: none;
            animation: boot-leave 480ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
          }
          @keyframes boot-leave {
            0%   { opacity: 1; transform: scale(1); filter: blur(0px); }
            100% { opacity: 0; transform: scale(1.04); filter: blur(8px); }
          }
          .boot-stack {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0;
          }

          /* ── 1. Logo enters first (0 → 700ms): scale up from 0.6 with
                a slight overshoot, plus a subtle Y rise. ─────────── */
          .boot-logo {
            position: relative;
            width: 116px; height: 116px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 26px;
            opacity: 0;
            animation: boot-logo-in 700ms cubic-bezier(0.22, 1.2, 0.4, 1) forwards;
          }
          @keyframes boot-logo-in {
            0%   { opacity: 0; transform: scale(0.6) translateY(20px); }
            60%  { opacity: 1; }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
          .boot-logo-card {
            position: relative;
            width: 96px; height: 96px;
            border-radius: 26px;
            background: #0e0f14;
            box-shadow:
              0 0 0 1px rgba(255, 255, 255, 0.08),
              0 30px 80px -10px rgba(0, 0, 0, 0.7),
              inset 0 0 0 1px rgba(255, 255, 255, 0.05);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            /* Slow breathing pulse once it's settled in */
            animation: boot-card-pulse 3s 1s ease-in-out infinite;
          }
          @keyframes boot-card-pulse {
            0%, 100% { transform: scale(1); }
            50%      { transform: scale(1.025); }
          }
          .boot-logo-card img {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }
          /* Scan light bar that sweeps across the logo once during the
             intro, mimicking the reflection on a polished app icon. */
          .boot-logo-card::after {
            content: "";
            position: absolute;
            top: 0; left: -120%;
            width: 60%; height: 100%;
            background: linear-gradient(
              105deg,
              transparent 30%,
              rgba(255, 255, 255, 0.18) 50%,
              transparent 70%
            );
            transform: skewX(-12deg);
            animation: boot-sweep 1400ms 800ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
          }
          @keyframes boot-sweep {
            0%   { left: -120%; }
            100% { left: 220%; }
          }

          /* ── 2. Wordmark fades up (650ms in, 600ms duration) ─────── */
          .boot-wordmark {
            margin: 0 0 30px;
            font-size: 22px;
            font-weight: 800;
            letter-spacing: -0.02em;
            color: #fff;
            opacity: 0;
            animation: boot-fade-up 600ms 650ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
          }
          @keyframes boot-fade-up {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }

          /* ── 3. Dots fade in (1100ms in, 500ms duration), then loop. ── */
          .boot-dots {
            display: flex;
            gap: 6px;
            opacity: 0;
            animation: boot-fade-up 500ms 1100ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
          }
          .boot-dots span {
            width: 5px; height: 5px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.45);
            animation: boot-dot 1.2s 1300ms ease-in-out infinite;
          }
          .boot-dots span:nth-child(2) { animation-delay: 1450ms; }
          .boot-dots span:nth-child(3) { animation-delay: 1600ms; }
          @keyframes boot-dot {
            0%, 80%, 100% { opacity: 0.25; transform: scale(0.85); }
            40%           { opacity: 1;    transform: scale(1.1); }
          }
        `}</style>
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
    if (!trimmed.startsWith("st_")) {
      setError("Format invalide. Le token commence par st_.");
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
      <div className="login-stage h-screen w-screen flex flex-col items-center justify-center px-9 bg-black">
        <div className="flex flex-col items-center mb-9">
          <img
            src="/logo.png"
            alt=""
            className="w-14 h-14 rounded-2xl border border-white/10 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.7)]"
          />
          <p className="mt-3 text-[10.5px] font-bold tracking-[0.32em] uppercase text-white/35">
            Shardtown
          </p>
        </div>
        <h1 className="text-[26px] font-extrabold tracking-tight mb-1.5 text-center">Connexion</h1>
        <p className="text-[13px] text-white/55 mb-7 text-center max-w-xs">
          Colle ton token d'accès personnel.
        </p>
        <form onSubmit={submit} className="w-full max-w-sm flex flex-col gap-3">
          <input
            autoFocus
            type="password"
            value={token}
            placeholder="st_…"
            onChange={e => setToken(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="w-full px-4 py-3.5 rounded-2xl bg-black/40 border border-white/10 focus:border-white/30 focus:bg-black/60 outline-none text-white font-mono text-[13px] transition-colors placeholder:text-white/20"
          />
          {error && (
            <div className="px-4 py-2.5 rounded-xl bg-red-500/[0.08] border border-red-500/25 text-red-300 text-xs leading-relaxed">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !token.trim()}
            className="w-full px-4 py-3.5 rounded-full bg-white text-black font-bold text-[13.5px] hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
          >
            {busy
              ? <><Loader2 size={13} strokeWidth={2.4} className="animate-spin" /> Vérification…</>
              : <><KeyRound size={13} strokeWidth={2.4} /> Continuer</>}
          </button>
          <button
            type="button"
            onClick={() => openExternal("https://shardtwn.fr/account")}
            className="text-[12px] text-white/55 hover:text-white underline underline-offset-[3px] inline-flex items-center justify-center gap-1.5 mt-2 mx-auto"
          >
            Générer un token <ExternalLink size={11} strokeWidth={2} />
          </button>

          {/* Demo hint — easy to overlook for real users, easy to find for
              the curious. Click pre-fills the magic offline token. */}
          <button
            type="button"
            onClick={() => setToken(DEMO_TOKEN)}
            className="text-[10.5px] text-white/30 hover:text-white/65 mx-auto mt-1 transition-colors"
            title="Mode démo offline — pré-remplit la clé de test"
          >
            Pas de compte ? Essayer en mode démo
          </button>
        </form>

        <style>{`
          .login-stage {
            animation: login-enter 700ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          @keyframes login-enter {
            0%   { opacity: 0; transform: scale(0.985) translateY(8px); filter: blur(6px); }
            60%  { filter: blur(0px); }
            100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0px); }
          }
        `}</style>
      </div>
    </>
  );
}
