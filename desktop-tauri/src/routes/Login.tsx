import { useState } from "react";
import { tokenSet } from "../token-store";
import { fetchMe, ApiError, type AccountMe } from "../api";
import { open as shellOpen } from "@tauri-apps/plugin-shell";

interface Props {
  reason?: string;
  onLoggedIn: (token: string, me: AccountMe) => void;
}

export function Login({ reason, onLoggedIn }: Props) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(reason ?? null);

  async function submit() {
    const trimmed = token.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith("st_")) {
      setError("Format invalide. Le token commence par st_.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const me = await fetchMe(trimmed);
      if (!me) {
        setError("Token rejeté par le serveur.");
        return;
      }
      // Validate first, persist second — never store a bad token.
      await tokenSet(trimmed);
      onLoggedIn(trimmed, me);
    } catch (err) {
      const msg = err instanceof ApiError
        ? (err.status === 401 ? "Token invalide ou révoqué." : err.message)
        : "Connexion impossible.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-brand">
        <img src="/logo.png" alt="" />
        <p>Shardtown</p>
      </div>
      <h1>Connexion</h1>
      <p className="sub">Colle ton token d'accès personnel.</p>
      <form
        className="login-form"
        onSubmit={e => { e.preventDefault(); submit(); }}
      >
        <input
          autoFocus
          type="password"
          value={token}
          placeholder="st_…"
          onChange={e => setToken(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        {error && <div className="err">{error}</div>}
        <button type="submit" className="primary" disabled={busy || !token.trim()}>
          {busy ? "Vérification…" : "Continuer"}
        </button>
        <button
          type="button"
          className="link"
          onClick={() => shellOpen("https://shardtwn.fr/account").catch(() => {})}
        >
          Générer un token
        </button>
      </form>
    </div>
  );
}
