import { useMemo, useState } from "react";
import {
  LayoutGrid, Shield, Zap, ChevronRight, LogOut,
  Server, BookOpen, Settings,
} from "lucide-react";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { tokenClear } from "../token-store";
import type { AccountMe } from "../api";

type Tab = "overview" | "shardguard" | "shard";

interface Props {
  token: string;
  me: AccountMe;
  onLogout: () => void;
}

export function Dashboard({ token: _token, me, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>("overview");

  const displayName = me.discord_username || me.pseudo || me.email;
  const initials = useMemo(
    () => (displayName || "?").slice(0, 1).toUpperCase(),
    [displayName],
  );
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

        <p className="sidebar-section">Accueil</p>
        <nav>
          <button
            type="button"
            className={`nav-item ${tab === "overview" ? "active" : ""}`}
            onClick={() => setTab("overview")}
          >
            <LayoutGrid size={15} strokeWidth={1.8} />
            Tableau de bord
          </button>
        </nav>

        <p className="sidebar-section">Bots</p>
        <nav>
          <button
            type="button"
            className={`nav-item ${tab === "shardguard" ? "active" : ""}`}
            onClick={() => setTab("shardguard")}
          >
            <Shield size={15} strokeWidth={1.8} />
            ShardGuard
          </button>
          <button
            type="button"
            className={`nav-item ${tab === "shard" ? "active" : ""}`}
            onClick={() => setTab("shard")}
          >
            <Zap size={15} strokeWidth={1.8} />
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
              <LogOut size={13} strokeWidth={2} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="main-inner">
          {tab === "overview" && <OverviewTab me={me} onOpenTab={setTab} />}
          {tab === "shardguard" && <BotTab kind="ShardGuard" />}
          {tab === "shard" && <BotTab kind="Shard" />}
        </div>

        <div className="statusbar">
          <span className="pill">
            <span className="dot" />
            Connecté
          </span>
          <span>{me.email}</span>
          <span className="sep">·</span>
          <span>shardtwn.fr</span>
        </div>
      </main>
    </div>
  );
}

function OverviewTab({ me, onOpenTab }: { me: AccountMe; onOpenTab: (t: Tab) => void }) {
  const linkedBots = [me.discord_username, me.shard_username].filter(Boolean).length;
  const subtitle = linkedBots === 0
    ? "Aucun bot lié pour le moment. Lie ton compte Discord pour commencer."
    : linkedBots === 1
    ? "Un bot lié. Ajoute le second pour profiter des deux univers."
    : "Tous tes bots sont liés. Configure-les dans les onglets dédiés.";

  return (
    <>
      <p className="tab-overline">Mon compte</p>
      <h1 className="tab-title">Bienvenue</h1>

      <div className="hero">
        <div className="hero-status">
          <span className="dot" />
          Tout fonctionne
        </div>
        <h2>{linkedBots} bot{linkedBots > 1 ? "s" : ""} lié{linkedBots > 1 ? "s" : ""}</h2>
        <p>{subtitle}</p>
        <button
          type="button"
          className="hero-cta"
          onClick={() => onOpenTab("shardguard")}
        >
          Configurer mes serveurs
          <ChevronRight size={14} strokeWidth={2.4} />
        </button>
      </div>

      <div className="quicks">
        <button type="button" className="quick" onClick={() => onOpenTab("shardguard")}>
          <span className="quick-icon"><Shield size={16} strokeWidth={1.8} /></span>
          <span className="quick-body">
            <p className="t">ShardGuard</p>
            <p className="s">Sécurité et modération</p>
          </span>
          <ChevronRight size={14} strokeWidth={2} className="quick-arrow" />
        </button>
        <button type="button" className="quick" onClick={() => onOpenTab("shard")}>
          <span className="quick-icon"><Zap size={16} strokeWidth={1.8} /></span>
          <span className="quick-body">
            <p className="t">Shard</p>
            <p className="s">Engagement et automatisation</p>
          </span>
          <ChevronRight size={14} strokeWidth={2} className="quick-arrow" />
        </button>
        <button
          type="button"
          className="quick"
          onClick={() => shellOpen("https://shardtwn.fr/wiki").catch(() => {})}
        >
          <span className="quick-icon"><BookOpen size={16} strokeWidth={1.8} /></span>
          <span className="quick-body">
            <p className="t">Documentation</p>
            <p className="s">Wiki, guides et FAQ</p>
          </span>
          <ChevronRight size={14} strokeWidth={2} className="quick-arrow" />
        </button>
      </div>

      <div className="section-head">
        <p className="h">Détails du compte</p>
        <button
          type="button"
          className="h-action"
          onClick={() => shellOpen("https://shardtwn.fr/account").catch(() => {})}
        >
          Gérer
        </button>
      </div>
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

function BotTab({ kind }: { kind: "ShardGuard" | "Shard" }) {
  const accent = kind === "ShardGuard" ? Shield : Zap;
  const Icon = accent;
  const description = kind === "ShardGuard"
    ? "Anti-raid, vérification captcha, modération automatique, sanctions progressives, mode panic, logs en temps réel."
    : "Niveaux, économie, tickets, sondages, giveaways, vocaux temporaires, embeds, anniversaires, annonces planifiées.";

  return (
    <>
      <p className="tab-overline">{kind}</p>
      <h1 className="tab-title">Mes serveurs</h1>

      <div className="hero">
        <div className="hero-status">
          <span className="dot" />
          Bot opérationnel
        </div>
        <h2>0 serveur configuré</h2>
        <p>{description}</p>
        <button
          type="button"
          className="hero-cta"
          onClick={() => shellOpen(`https://shardtwn.fr/${kind.toLowerCase()}/server`).catch(() => {})}
        >
          Ajouter un serveur
          <ChevronRight size={14} strokeWidth={2.4} />
        </button>
      </div>

      <div className="quicks">
        <button
          type="button"
          className="quick"
          onClick={() => shellOpen("https://shardtwn.fr/wiki").catch(() => {})}
        >
          <span className="quick-icon"><BookOpen size={16} strokeWidth={1.8} /></span>
          <span className="quick-body">
            <p className="t">Documentation</p>
            <p className="s">Comment configurer {kind}</p>
          </span>
          <ChevronRight size={14} strokeWidth={2} className="quick-arrow" />
        </button>
        <button type="button" className="quick" disabled>
          <span className="quick-icon"><Server size={16} strokeWidth={1.8} /></span>
          <span className="quick-body">
            <p className="t">Mes guildes</p>
            <p className="s">Bientôt, intégré nativement</p>
          </span>
          <ChevronRight size={14} strokeWidth={2} className="quick-arrow" />
        </button>
        <button type="button" className="quick" disabled>
          <span className="quick-icon"><Settings size={16} strokeWidth={1.8} /></span>
          <span className="quick-body">
            <p className="t">Préférences</p>
            <p className="s">Bientôt</p>
          </span>
          <ChevronRight size={14} strokeWidth={2} className="quick-arrow" />
        </button>
      </div>

      <div className="empty">
        <p className="label">Bientôt</p>
        <p>
          La configuration inline de {kind} (modules, salons, rôles, automatisations)
          sera intégrée directement dans cette app.
        </p>
        <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-dim)" }}>
          <Icon size={12} strokeWidth={1.8} />
          Pour l'instant, le bouton « Ajouter un serveur » ouvre l'interface web.
        </p>
      </div>
    </>
  );
}
