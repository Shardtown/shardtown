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
        : "Connexion impossible. Vérifie ta connexion internet.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <p className="overline">Connexion</p>
        <h1>Token d'accès personnel</h1>
        <p>
          Génère un token sur ton compte Shardtown puis colle-le ici. Il sera
          stocké dans le trousseau macOS, jamais en clair sur le disque.
        </p>
        <input
          autoFocus
          type="password"
          value={token}
          placeholder="st_…"
          onChange={e => setToken(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        {error && <div className="err">{error}</div>}
        <div className="actions">
          <button
            type="button"
            className="secondary"
            onClick={() => shellOpen("https://shardtwn.fr/account").catch(() => {})}
          >
            Générer un token
          </button>
          <button type="button" onClick={submit} disabled={busy || !token.trim()}>
            {busy ? "Vérification…" : "Continuer"}
          </button>
        </div>
        <p className="hint">
          Tu n'as pas encore de compte ?{" "}
          <a
            href="#"
            onClick={e => {
              e.preventDefault();
              shellOpen("https://shardtwn.fr/account/login").catch(() => {});
            }}
          >
            Créer un compte
          </a>
        </p>
      </div>
    </div>
  );
}
