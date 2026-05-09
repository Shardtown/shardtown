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
 * Top-level state machine: read the Keychain on boot, validate the token by
 * hitting /api/account/me, then drop to login or dashboard. Re-validating on
 * every boot means a revoked token never leaves the user on a dashboard
 * that's silently broken.
 *
 * The boot screen is held for at least 600ms so the logo pulse reads as a
 * deliberate brand moment instead of a flash.
 */
export function App() {
  const [state, setState] = useState<State>({ kind: "boot" });

  useEffect(() => {
    let cancelled = false;
    const minBoot = new Promise<void>(r => setTimeout(r, 600));
    (async () => {
      const token = await tokenGet().catch(() => null);
      let next: State;
      if (!token) {
        next = { kind: "login" };
      } else {
        try {
          const me = await fetchMe(token);
          next = me
            ? { kind: "dashboard", token, me }
            : { kind: "login", reason: "Token invalide. Régénère-en un sur shardtwn.fr/account." };
        } catch (err) {
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

  return (
    <>
      {/* Invisible drag handle on top so the chromeless window stays draggable */}
      <div className="dragbar" data-tauri-drag-region />

      <div className="app">
        {state.kind === "boot" && (
          <div className="boot">
            <div className="boot-logo">
              <img src="/logo.png" alt="" />
            </div>
          </div>
        )}
        {state.kind === "login" && (
          <Login
            reason={state.reason}
            onLoggedIn={(token, me) => setState({ kind: "dashboard", token, me })}
          />
        )}
        {state.kind === "dashboard" && (
          <Dashboard
            token={state.token}
            me={state.me}
            onLogout={() => setState({ kind: "login" })}
          />
        )}
      </div>
    </>
  );
}
