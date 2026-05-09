import { useMemo, useState } from "react";
import { tokenClear } from "../token-store";
import type { AccountMe } from "../api";

type Tab = "account" | "shardguard" | "shard";

interface Props {
  token: string;
  me: AccountMe;
  onLogout: () => void;
}

export function Dashboard({ token: _token, me, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>("account");

  const displayName = me.discord_username || me.pseudo || me.email;
  const initials = useMemo(() => {
    const src = displayName || "?";
    return src.slice(0, 1).toUpperCase();
  }, [displayName]);
  const avatarUrl = useMemo(() => {
    if (me.discord_id && me.discord_avatar) {
      return `https://cdn.discordapp.com/avatars/${me.discord_id}/${me.discord_avatar}.png?size=64`;
    }
    return null;
  }, [me]);

  async function logout() {
    await tokenClear().catch(() => {});
    onLogout();
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="" />
          <span>Shardtown</span>
        </div>

        <p className="sidebar-section">Espace</p>
        <nav>
          <button
            type="button"
            className={`nav-item ${tab === "account" ? "active" : ""}`}
            onClick={() => setTab("account")}
          >
            <span className="dot" />
            Compte
          </button>
        </nav>

        <p className="sidebar-section">Bots</p>
        <nav>
          <button
            type="button"
            className={`nav-item ${tab === "shardguard" ? "active" : ""}`}
            onClick={() => setTab("shardguard")}
          >
            <span className="dot" />
            ShardGuard
          </button>
          <button
            type="button"
            className={`nav-item ${tab === "shard" ? "active" : ""}`}
            onClick={() => setTab("shard")}
          >
            <span className="dot" />
            Shard
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-row">
            {avatarUrl
              ? <img src={avatarUrl} alt="" />
              : <div className="avatar-fallback">{initials}</div>}
            <span className="name">{displayName}</span>
            <button
              type="button"
              className="logout"
              onClick={logout}
              aria-label="Déconnexion"
              title="Déconnexion"
            >
              ↪
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="main-inner">
          {tab === "account" && <AccountTab me={me} />}
          {tab === "shardguard" && <BotPlaceholder kind="ShardGuard" />}
          {tab === "shard" && <BotPlaceholder kind="Shard" />}
        </div>
      </main>
    </div>
  );
}

function AccountTab({ me }: { me: AccountMe }) {
  return (
    <>
      <p className="tab-overline">Mon compte</p>
      <h1 className="tab-title">Vue d'ensemble</h1>
      <p className="tab-sub">
        Identité Shardtown et liaisons des bots Discord. Les modifications se font côté web.
      </p>
      <div className="kv-grid">
        <div className="kv">
          <p className="k">Email</p>
          <p className="v">{me.email}</p>
        </div>
        <div className="kv">
          <p className="k">ShardGuard Discord</p>
          <p className={`v ${me.discord_username ? "" : "muted"}`}>
            {me.discord_username ?? "Non lié"}
          </p>
        </div>
        <div className="kv">
          <p className="k">Shard Discord</p>
          <p className={`v ${me.shard_username ? "" : "muted"}`}>
            {me.shard_username ?? "Non lié"}
          </p>
        </div>
        <div className="kv">
          <p className="k">Compte créé</p>
          <p className="v">
            {new Date(me.created_at).toLocaleDateString("fr-FR", {
              day: "numeric", month: "long", year: "numeric",
            })}
          </p>
        </div>
      </div>
    </>
  );
}

function BotPlaceholder({ kind }: { kind: "ShardGuard" | "Shard" }) {
  return (
    <>
      <p className="tab-overline">{kind}</p>
      <h1 className="tab-title">Mes serveurs</h1>
      <p className="tab-sub">
        La liste de tes serveurs où {kind} est installé arrive bientôt directement
        dans l'app, avec la configuration inline. Pour l'instant, ce panneau sert
        de point d'ancrage.
      </p>
      <div className="empty">
        <p className="label">Bientôt</p>
        <p>
          Configuration des modules {kind} (anti-raid, modération, niveaux,
          tickets…) intégrée nativement, sans aller-retour vers le navigateur.
        </p>
      </div>
    </>
  );
}
