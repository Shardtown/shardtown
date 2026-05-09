import { useEffect, useState, type ReactNode } from "react";
import { Loader2, KeyRound, ExternalLink } from "lucide-react";
import { IS_DESKTOP, tokenGet, tokenSet, openExternal } from "@/lib/desktop";
import { apiGet, ApiError, setBearerToken } from "@/api/client";

type State =
  | { kind: "boot" }
  | { kind: "login"; reason?: string }
  | { kind: "ready" };

/**
 * Wraps the SPA when running inside Tauri. Reads the keychain on boot,
 * validates the token by hitting /api/account/me, then either renders the
 * children (logged-in app) or shows the PAT login screen. In web mode it
 * renders children immediately — the regular cookie-auth flow handles
 * everything from there.
 */
export function DesktopGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(IS_DESKTOP ? { kind: "boot" } : { kind: "ready" });

  useEffect(() => {
    if (!IS_DESKTOP) return;
    let cancelled = false;
    const minBoot = new Promise<void>(r => setTimeout(r, 500));
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
      await minBoot;
      if (!cancelled) setState(next);
    })();
    return () => { cancelled = true; };
  }, []);

  if (state.kind === "boot") return <BootScreen />;
  if (state.kind === "login") {
    return (
      <DesktopLogin
        reason={state.reason}
        onSuccess={() => setState({ kind: "ready" })}
      />
    );
  }
  return <>{children}</>;
}

function BootScreen() {
  return (
    <>
      <div className="fixed inset-x-0 top-0 h-7 z-50" data-tauri-drag-region />
      <div className="h-screen w-screen flex items-center justify-center bg-black">
        <div className="w-20 h-20 rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden flex items-center justify-center animate-pulse">
          <img src="/logo.png" alt="" className="w-3/5 h-3/5 object-contain" />
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
    if (!trimmed.startsWith("st_")) {
      setError("Format invalide. Le token commence par st_.");
      return;
    }
    setBusy(true);
    setError(null);
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
      <div className="h-screen w-screen flex flex-col items-center justify-center px-9 bg-black">
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
        </form>
      </div>
    </>
  );
}
