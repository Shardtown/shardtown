import {
  useCallback, useEffect, useMemo, useRef, useState,
  type MutableRefObject, type ReactNode,
} from "react";
import {
  LayoutGrid, Shield, Zap, ChevronRight, LogOut,
  BookOpen, RefreshCw, AlertCircle,
} from "lucide-react";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { tokenClear } from "../token-store";
import {
  fetchGuilds, refreshGuilds, ApiError,
  type AccountMe, type GuildSummary,
} from "../api";

type Tab = "overview" | "shardguard" | "shard";

// Read once at module load — Vite injects PACKAGE_VERSION via define in
// vite.config.ts so the app always shows the package.json version without
// hardcoding it in two places.
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "0.1.0";

interface Props {
  token: string;
  me: AccountMe;
  onLogout: () => void;
}

export function Dashboard({ token, me, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const reloadRef = useRef<(() => void) | null>(null);

  // Native-feeling keyboard shortcuts: ⌘1/⌘2/⌘3 switch tabs, ⌘R reloads the
  // current tab's data when the bot tabs are mounted.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey || e.altKey) return;
      switch (e.key) {
        case "1": setTab("overview"); e.preventDefault(); break;
        case "2": setTab("shardguard"); e.preventDefault(); break;
        case "3": setTab("shard"); e.preventDefault(); break;
        case "r":
        case "R":
          if (reloadRef.current) { reloadRef.current(); e.preventDefault(); }
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
          <SidebarItem
            active={tab === "overview"}
            onClick={() => setTab("overview")}
            icon={<LayoutGrid size={15} strokeWidth={1.8} />}
            label="Tableau de bord"
          />
        </nav>

        <p className="sidebar-section">Bots</p>
        <nav>
          <SidebarItem
            active={tab === "shardguard"}
            onClick={() => setTab("shardguard")}
            icon={<Shield size={15} strokeWidth={1.8} />}
            label="ShardGuard"
          />
          <SidebarItem
            active={tab === "shard"}
            onClick={() => setTab("shard")}
            icon={<Zap size={15} strokeWidth={1.8} />}
            label="Shard"
          />
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
        <div key={tab} className="main-inner tab-fade">
          {tab === "overview" && <OverviewTab me={me} onOpenTab={setTab} />}
          {tab === "shardguard" && <BotTab kind="shardguard" token={token} reloadRef={reloadRef} />}
          {tab === "shard" && <BotTab kind="shard" token={token} reloadRef={reloadRef} />}
        </div>

        <div className="statusbar">
          <span className="pill">
            <span className="dot" />
            Connecté
          </span>
          <span>{me.email}</span>
          <span className="sep">·</span>
          <span>shardtwn.fr</span>
          <span className="sep">·</span>
          <span className="version">v{APP_VERSION}</span>
        </div>
      </main>
    </div>
  );
}

function SidebarItem({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`nav-item ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
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

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; guilds: GuildSummary[]; fetchedAt: string | null; stale: boolean }
  | { kind: "error"; message: string; status?: number };

function BotTab({
  kind, token, reloadRef,
}: {
  kind: "shardguard" | "shard";
  token: string;
  reloadRef: MutableRefObject<(() => void) | null>;
}) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const r = await fetchGuilds(token, kind);
      setState({ kind: "ok", guilds: r.guilds, fetchedAt: r.fetched_at, stale: r.stale });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : undefined;
      const message = err instanceof ApiError
        ? (status === 401 ? "Token expiré ou révoqué."
          : status === 403 ? "Accès refusé."
          : err.message)
        : "Connexion impossible.";
      setState({ kind: "error", message, status });
    }
  }, [token, kind]);

  // Expose load() to the parent so ⌘R triggers it from anywhere.
  useEffect(() => {
    reloadRef.current = load;
    return () => { reloadRef.current = null; };
  }, [load, reloadRef]);

  useEffect(() => { load(); }, [load]);

  // Reload when the window regains focus so the user doesn't stare at stale
  // data after coming back to the app from a long break.
  useEffect(() => {
    function onFocus() { load(); }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  async function doRefresh() {
    setRefreshing(true);
    try {
      await refreshGuilds(token, kind);
      await load();
    } catch {
      // Surface in-tab; the load() error path will catch the next fetch
      // failure if the refresh actually broke something.
    } finally {
      setRefreshing(false);
    }
  }

  const label = kind === "shardguard" ? "ShardGuard" : "Shard";
  const description = kind === "shardguard"
    ? "Anti-raid, vérification captcha, modération automatique, sanctions progressives, mode panic, logs en temps réel."
    : "Niveaux, économie, tickets, sondages, giveaways, vocaux temporaires, embeds, anniversaires, annonces planifiées.";

  const guilds = state.kind === "ok" ? state.guilds : [];
  const present = guilds.filter(g => g.bot_present).length;
  const total = guilds.length;

  return (
    <>
      <p className="tab-overline">{label}</p>
      <h1 className="tab-title">Mes serveurs</h1>

      <div className="hero">
        <div className="hero-status">
          <span className="dot" />
          Bot opérationnel
        </div>
        <h2>
          {state.kind === "loading" ? "…" : `${present} / ${total} serveur${total > 1 ? "s" : ""}`}
        </h2>
        <p>{description}</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="hero-cta"
            onClick={() => shellOpen(`https://shardtwn.fr/${kind}/server`).catch(() => {})}
          >
            Ouvrir la config
            <ChevronRight size={14} strokeWidth={2.4} />
          </button>
          <button
            type="button"
            className="hero-cta-secondary"
            onClick={doRefresh}
            disabled={refreshing || state.kind === "loading"}
            aria-label="Synchroniser"
          >
            <RefreshCw size={13} strokeWidth={2} className={refreshing ? "spin" : ""} />
            Synchroniser
          </button>
        </div>
      </div>

      <div className="section-head">
        <p className="h">Mes serveurs admin</p>
        {state.kind === "ok" && (
          <span className="h-meta">
            {state.fetchedAt
              ? `Sync : ${new Date(state.fetchedAt).toLocaleString("fr-FR", {
                  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                })}`
              : "Jamais synchronisé"}
          </span>
        )}
      </div>

      <GuildList state={state} kind={kind} />
    </>
  );
}

function GuildList({ state, kind }: { state: LoadState; kind: "shardguard" | "shard" }) {
  if (state.kind === "loading") {
    return (
      <div className="list">
        {[0, 1, 2].map(i => <div key={i} className="guild-row guild-skeleton" />)}
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="error-state">
        <AlertCircle size={18} strokeWidth={1.6} />
        <div>
          <p className="t">Impossible de charger tes serveurs</p>
          <p className="s">{state.message}</p>
        </div>
      </div>
    );
  }
  if (state.guilds.length === 0) {
    const neverSynced = state.fetchedAt === null;
    return (
      <div className="empty">
        <p className="label">{neverSynced ? "Pas encore synchronisé" : "Aucun serveur admin"}</p>
        <p>
          {neverSynced
            ? `Clique sur Synchroniser ci-dessus pour récupérer la liste des serveurs où tu es admin et où ${kind === "shardguard" ? "ShardGuard" : "Shard"} peut être ajouté.`
            : "Tu n'as les permissions admin sur aucun serveur Discord. Si tu en as récemment rejoint un, clique sur Synchroniser pour rafraîchir."}
        </p>
      </div>
    );
  }
  return (
    <div className="list">
      {state.guilds.map(g => <GuildRow key={g.id} g={g} kind={kind} />)}
    </div>
  );
}

function GuildRow({ g, kind }: { g: GuildSummary; kind: "shardguard" | "shard" }) {
  const iconUrl = g.icon
    ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`
    : null;
  const initials = g.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase().slice(0, 2);

  function open() {
    const path = g.bot_present
      ? `/${kind}/guild/${g.id}`
      : `/${kind}/server`;
    shellOpen(`https://shardtwn.fr${path}`).catch(() => {});
  }

  return (
    <button type="button" className="guild-row" onClick={open}>
      {iconUrl
        ? <img src={iconUrl} alt="" className="guild-icon" />
        : <div className="guild-icon guild-icon-fallback">{initials || "?"}</div>}
      <div className="guild-body">
        <p className="t">
          {g.name}
          {g.owner && <span className="badge owner">Owner</span>}
        </p>
        <p className="s">
          {g.bot_present
            ? <span className="badge ok">Bot configuré</span>
            : <span className="badge muted">À inviter</span>}
        </p>
      </div>
      <ChevronRight size={14} strokeWidth={2} className="guild-arrow" />
    </button>
  );
}
