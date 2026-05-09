import { useEffect, useState } from "react";
import { tokenGet } from "./token-store";
import { fetchMe, ApiError, type AccountMe } from "./api";
import { Login } from "./routes/Login";
import { Dashboard } from "./routes/Dashboard";

type State =
  | { kind: "boot" }
  | { kind: "login"; reason?: string }
  | { kind: "dashboard"; token: string; me: AccountMe };

/**
 * Top-level state machine: boot reads the Keychain, validates the token by
 * hitting /api/account/me, and either drops to login or to the dashboard.
 * Re-validating on boot means a revoked token doesn't leave the user stuck
 * on a dashboard that's silently broken.
 */
export function App() {
  const [state, setState] = useState<State>({ kind: "boot" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await tokenGet().catch(() => null);
      if (!token) {
        if (!cancelled) setState({ kind: "login" });
        return;
      }
      try {
        const me = await fetchMe(token);
        if (cancelled) return;
        if (!me) {
          setState({ kind: "login", reason: "Token invalide. Régénère-en un sur shardtwn.fr/account." });
        } else {
          setState({ kind: "dashboard", token, me });
        }
      } catch (err) {
        if (cancelled) return;
        const reason = err instanceof ApiError && err.status === 401
          ? "Token expiré ou révoqué. Régénère-en un."
          : "Connexion impossible. Vérifie ta connexion internet.";
        setState({ kind: "login", reason });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function handleLoggedIn(token: string, me: AccountMe) {
    setState({ kind: "dashboard", token, me });
  }

  function handleLogout() {
    setState({ kind: "login" });
  }

  return (
    <div className="app">
      <div className="titlebar" data-tauri-drag-region>Shardtown</div>
      <div className="content">
        {state.kind === "boot" && <div className="loading">Chargement…</div>}
        {state.kind === "login" && <Login reason={state.reason} onLoggedIn={handleLoggedIn} />}
        {state.kind === "dashboard" && (
          <Dashboard token={state.token} me={state.me} onLogout={handleLogout} />
        )}
      </div>
    </div>
  );
}
