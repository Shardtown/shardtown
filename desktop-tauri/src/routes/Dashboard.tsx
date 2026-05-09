import { useMemo } from "react";
import { tokenClear } from "../token-store";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import type { AccountMe } from "../api";

interface Props {
  // Kept on the props bag so future tabs can issue authenticated calls
  // without plumbing it down again. Prefix is the lint-tolerated unused mark.
  token: string;
  me: AccountMe;
  onLogout: () => void;
}

export function Dashboard({ token: _token, me, onLogout }: Props) {
  const displayName = me.discord_username || me.pseudo || me.email;

  const avatarUrl = useMemo(() => {
    if (me.discord_id && me.discord_avatar) {
      return `https://cdn.discordapp.com/avatars/${me.discord_id}/${me.discord_avatar}.png?size=128`;
    }
    return null;
  }, [me]);

  async function logout() {
    await tokenClear().catch(() => {});
    onLogout();
  }

  function openExternal(path: string) {
    shellOpen(`https://shardtwn.fr${path}`).catch(() => {});
  }

  return (
    <div className="dash">
      <header className="dash-hero">
        {avatarUrl
          ? <img src={avatarUrl} alt="" className="avatar" />
          : <div className="avatar" />}
        <div>
          <p className="sub">Mon compte</p>
          <h1>Bonjour, {displayName}</h1>
        </div>
      </header>

      <div className="grid">
        <div className="card">
          <p className="label">Email</p>
          <p className="value">{me.email}</p>
        </div>
        <div className="card">
          <p className="label">ShardGuard</p>
          <p className={`value ${me.discord_username ? "" : "muted"}`}>
            {me.discord_username ?? "Non lié"}
          </p>
        </div>
        <div className="card">
          <p className="label">Shard</p>
          <p className={`value ${me.shard_username ? "" : "muted"}`}>
            {me.shard_username ?? "Non lié"}
          </p>
        </div>
        <div className="card">
          <p className="label">Compte créé</p>
          <p className="value">
            {new Date(me.created_at).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      <div className="toolbar">
        <button type="button" className="btn primary" onClick={() => openExternal("/outils")}>
          Ouvrir mes outils
        </button>
        <button type="button" className="btn" onClick={() => openExternal("/account")}>
          Gérer mon compte
        </button>
        <button type="button" className="btn danger" onClick={logout}>
          Déconnexion
        </button>
      </div>
    </div>
  );
}
