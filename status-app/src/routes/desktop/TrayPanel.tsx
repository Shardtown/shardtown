import { useEffect, useMemo, useState } from "react";
import {
  Search, ChevronRight, Bell, Settings,
  CheckCircle2, X,
} from "lucide-react";
import { apiGet, setBearerToken } from "@/api/client";
import { tokenGet, openExternal } from "@/lib/desktop";

/**
 * Tray-icon popover, 360×520 window anchored under the menu-bar icon.
 * NordVPN-style: top bar with branding + actions, hero status card with
 * primary CTA, recent servers grid, bots-by-status section, footer.
 */

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  bot_present: boolean;
  bot: "mod" | "shard";
}

interface SummaryData {
  mod: Guild[];
  shard: Guild[];
}

export function TrayPanel() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await tokenGet().catch(() => null);
      if (!token) {
        if (!cancelled) setError("Ouvre l'app pour te connecter.");
        return;
      }
      setBearerToken(token);
      try {
        const [sg, s] = await Promise.all([
          apiGet<{ guilds: Omit<Guild, "bot">[] }>("/api/account/guilds?bot=mod"),
          apiGet<{ guilds: Omit<Guild, "bot">[] }>("/api/account/guilds?bot=shard"),
        ]);
        if (!cancelled) setData({
          mod: sg.guilds.map(g => ({ ...g, bot: "mod" })),
          shard: s.guilds.map(g => ({ ...g, bot: "shard" })),
        });
      } catch {
        if (!cancelled) setError("Erreur de connexion.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const allGuilds = useMemo(() => {
    if (!data) return [];
    return [...data.mod, ...data.shard];
  }, [data]);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allGuilds.filter(g => g.name.toLowerCase().includes(q)).slice(0, 6);
  }, [allGuilds, query]);

  const sgActive = data?.mod.filter(g => g.bot_present).length ?? 0;
  const sgTotal = data?.mod.length ?? 0;
  const sActive = data?.shard.filter(g => g.bot_present).length ?? 0;
  const sTotal = data?.shard.length ?? 0;
  // Unified bot, count distinct guilds across both OAuth flows so the
  // "active on N servers" tally doesn't double-count.
  const uniqueGuildIds = new Set<string>();
  const uniqueActiveIds = new Set<string>();
  for (const g of allGuilds) {
    uniqueGuildIds.add(g.id);
    if (g.bot_present) uniqueActiveIds.add(g.id);
  }
  const totalActive = uniqueActiveIds.size;
  const totalGuilds = uniqueGuildIds.size;
  const allActive = totalActive > 0 && totalActive === totalGuilds;

  // Recents = first 4 configured guilds (deduplicated by id across bots)
  const recents = useMemo(() => {
    const seen = new Set<string>();
    const out: Guild[] = [];
    for (const g of allGuilds) {
      if (!g.bot_present) continue;
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      out.push(g);
      if (out.length >= 4) break;
    }
    return out;
  }, [allGuilds]);

  function openMain(path = "/outils") {
    openExternal(`https://shardtwn.fr${path}`).catch(() => {});
  }

  return (
    <div className="tray-panel">
      <div className="tray-drag" data-tauri-drag-region />

      {/* Top bar, brand + small action icons */}
      <header className="tray-top">
        <button type="button" className="tray-brand" onClick={() => openMain("/outils")}>
          <img src="/image/favicon.png" alt="" />
          <span>Ouvrir l'application</span>
        </button>
        <div className="tray-top-actions">
          <button type="button" className="tray-icon-btn" title="Notifications">
            <Bell size={13} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="tray-icon-btn"
            title="Réglages"
            onClick={() => openMain("/preferences")}
          >
            <Settings size={13} strokeWidth={2} />
          </button>
        </div>
      </header>

      {/* Search */}
      <div className="tray-search">
        <Search size={13} strokeWidth={2} />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Rechercher un serveur, une action…"
          spellCheck={false}
        />
        {query && (
          <button type="button" className="tray-search-clear" onClick={() => setQuery("")}>
            <X size={11} strokeWidth={2.4} />
          </button>
        )}
      </div>

      {/* Search results take over the middle when active */}
      {query ? (
        <div className="tray-scroll">
          <div className="tray-results">
            {filtered.length === 0 ? (
              <p className="tray-empty">Aucun serveur ne correspond.</p>
            ) : (
              filtered.map(g => <TrayGuildRow key={`${g.bot}:${g.id}`} guild={g} />)
            )}
          </div>
        </div>
      ) : (
        <div className="tray-scroll">
          {/* Hero status card */}
          <div className={`tray-hero ${allActive ? "ok" : "warn"}`}>
            <div className="tray-hero-icon">
              <CheckCircle2 size={20} strokeWidth={2} />
            </div>
            <div className="tray-hero-body">
              <p className="tray-hero-title">
                {totalActive > 0
                  ? allActive ? "Shard active partout" : `Shard active sur ${totalActive} serveur${totalActive > 1 ? "s" : ""}`
                  : "Shard n'est sur aucun serveur"}
              </p>
              <p className="tray-hero-sub">
                {totalActive > 0
                  ? `Sur ${totalGuilds} serveur${totalGuilds > 1 ? "s" : ""} où tu es admin`
                  : "Configure tes serveurs depuis l'app"}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="tray-cta"
            onClick={() => openMain("/outils")}
          >
            Ouvrir le tableau de bord
            <ChevronRight size={13} strokeWidth={2.4} />
          </button>

          {/* Recents */}
          {recents.length > 0 && (
            <>
              <div className="tray-section-head">
                <span>Récents</span>
                <button
                  type="button"
                  className="tray-section-link"
                  onClick={() => openMain("/outils")}
                >
                  Tous <ChevronRight size={9} strokeWidth={2.4} />
                </button>
              </div>
              <div className="tray-grid">
                {recents.map(g => <TrayRecentCard key={`${g.bot}:${g.id}`} guild={g} />)}
              </div>
            </>
          )}

          {/* Shard */}
          <div className="tray-section-head">
            <span>Shard</span>
          </div>
          <div className="tray-bot-list">
            <TrayBotRow
              kind="shard"
              icon={<img src="/image/shard.png" alt="" className="tray-bot-avatar" />}
              label="Shard"
              active={Math.max(sgActive, sActive)}
              total={Math.max(sgTotal, sTotal)}
              onClick={() => openMain("/shard/server")}
            />
          </div>
        </div>
      )}

      {error && <div className="tray-error">{error}</div>}

      <TrayStyles />
    </div>
  );
}

function TrayGuildRow({ guild }: { guild: Guild }) {
  const iconUrl = guild.icon
    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`
    : null;
  const initials = guild.name[0]?.toUpperCase() ?? "?";
  return (
    <button
      type="button"
      className="tray-row"
      onClick={() => openExternal(`https://shardtwn.fr/shard/guild/${guild.id}`).catch(() => {})}
    >
      {iconUrl
        ? <img src={iconUrl} alt="" className="tray-row-icon" />
        : <div className="tray-row-icon tray-row-icon-fallback">{initials}</div>}
      <div className="tray-row-body">
        <p className="tray-row-name">{guild.name}</p>
        <p className="tray-row-meta">
          <img src="/image/shard.png" alt="" className="tray-bot-avatar-xs" />
          Shard
          {guild.bot_present && <span className="tray-row-ok">· Configuré</span>}
        </p>
      </div>
      <ChevronRight size={11} strokeWidth={2} className="tray-row-arrow" />
    </button>
  );
}

function TrayRecentCard({ guild }: { guild: Guild }) {
  const iconUrl = guild.icon
    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`
    : null;
  const initials = guild.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase().slice(0, 2);
  return (
    <button
      type="button"
      className="tray-card"
      onClick={() => openExternal(`https://shardtwn.fr/shard/guild/${guild.id}`).catch(() => {})}
    >
      {iconUrl
        ? <img src={iconUrl} alt="" className="tray-card-icon" />
        : <div className="tray-card-icon tray-card-icon-fallback">{initials || "?"}</div>}
      <p className="tray-card-name">{guild.name}</p>
      <p className="tray-card-meta">Le plus actif</p>
    </button>
  );
}

function TrayBotRow({
  icon, label, active, total, onClick,
}: {
  kind: "mod" | "shard";
  icon: React.ReactNode;
  label: string;
  active: number;
  total: number;
  onClick: () => void;
}) {
  const ok = active > 0;
  return (
    <button type="button" className="tray-bot-row" onClick={onClick}>
      <span className="tray-bot-icon">{icon}</span>
      <div className="tray-bot-body">
        <p className="tray-bot-label">{label}</p>
        <p className="tray-bot-meta">
          <span className={`tray-bot-state ${ok ? "ok" : ""}`}>{ok ? "Actif" : "Inactif"}</span>
          <span className="tray-sep">·</span>
          <span>{active} / {total} serveur{total > 1 ? "s" : ""}</span>
        </p>
      </div>
      <ChevronRight size={11} strokeWidth={2} className="tray-bot-arrow" />
    </button>
  );
}

function TrayStyles() {
  return (
    <style>{`
      html, body, #root {
        background: transparent;
        overflow: hidden;
        height: 100%;
        margin: 0;
      }
      .tray-panel {
        position: relative;
        width: calc(100% - 24px);
        height: calc(100% - 20px);
        margin: 4px 12px 16px;
        background: #15161b;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 18px;
        box-shadow:
          0 24px 60px -10px rgba(0, 0, 0, 0.5),
          0 8px 20px -5px rgba(0, 0, 0, 0.35);
        color: #f5f5f7;
        font-family: -apple-system, "SF Pro Display", "SF Pro Text", system-ui, sans-serif;
        font-size: 13px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .tray-drag {
        height: 6px;
        flex-shrink: 0;
        -webkit-app-region: drag;
      }
      .tray-scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 0 14px;
      }
      .tray-scroll::-webkit-scrollbar { width: 0; }

      /* Top bar */
      .tray-top {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px 4px;
        flex-shrink: 0;
      }
      .tray-brand {
        flex: 1;
        display: flex; align-items: center; gap: 8px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 12px;
        padding: 8px 12px;
        color: #fff;
        font-size: 12.5px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        text-align: left;
        transition: background 0.12s ease;
      }
      .tray-brand:hover { background: rgba(255, 255, 255, 0.07); }
      .tray-brand img { width: 18px; height: 18px; border-radius: 5px; }
      .tray-top-actions { display: flex; gap: 4px; flex-shrink: 0; }
      .tray-icon-btn {
        width: 32px; height: 32px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.65);
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.12s ease, color 0.12s ease;
      }
      .tray-icon-btn:hover {
        background: rgba(255, 255, 255, 0.07);
        color: #fff;
      }

      /* Search */
      .tray-search {
        margin: 6px 14px 12px;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 12px;
        display: flex; align-items: center; gap: 8px;
        color: rgba(255, 255, 255, 0.5);
        flex-shrink: 0;
      }
      .tray-search input {
        flex: 1;
        background: none; border: none; outline: none;
        color: #fff;
        font-size: 12.5px;
        font-family: inherit;
      }
      .tray-search input::placeholder { color: rgba(255, 255, 255, 0.28); }
      .tray-search-clear {
        background: none; border: none; cursor: pointer;
        color: rgba(255, 255, 255, 0.38);
        padding: 2px;
        display: flex;
      }
      .tray-search-clear:hover { color: #fff; }

      /* Hero status card */
      .tray-hero {
        display: flex; align-items: flex-start; gap: 12px;
        padding: 14px 14px 14px;
        border-radius: 14px;
        background: rgba(var(--ds-status-ok-rgb), 0.06);
        border: 1px solid rgba(var(--ds-status-ok-rgb), 0.22);
        margin-bottom: 8px;
      }
      .tray-hero.warn {
        background: rgba(251, 191, 36, 0.06);
        border-color: rgba(251, 191, 36, 0.22);
      }
      .tray-hero-icon {
        width: 36px; height: 36px;
        border-radius: 11px;
        background: rgba(var(--ds-status-ok-rgb), 0.12);
        color: var(--ds-status-ok);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .tray-hero.warn .tray-hero-icon {
        background: rgba(251, 191, 36, 0.12);
        color: rgb(251, 191, 36);
      }
      .tray-hero-body { flex: 1; min-width: 0; }
      .tray-hero-title {
        margin: 0;
        font-size: 14.5px;
        font-weight: 700;
        line-height: 1.2;
        color: #fff;
      }
      .tray-hero-sub {
        margin: 4px 0 0;
        font-size: 11.5px;
        color: rgba(255, 255, 255, 0.55);
      }

      /* Primary CTA */
      .tray-cta {
        width: 100%;
        padding: 11px 14px;
        border-radius: 12px;
        border: none;
        background: #fff;
        color: #000;
        font-family: inherit;
        font-weight: 700;
        font-size: 12.5px;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center; gap: 6px;
        transition: opacity 0.12s ease, transform 0.05s ease;
        margin-bottom: 16px;
      }
      .tray-cta:hover { opacity: 0.9; }
      .tray-cta:active { transform: scale(0.99); }

      /* Section headers */
      .tray-section-head {
        display: flex; align-items: center; justify-content: space-between;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.4);
        padding: 6px 2px;
        margin-top: 4px;
      }
      .tray-section-link {
        display: inline-flex; align-items: center; gap: 2px;
        background: none; border: none;
        color: rgba(255, 255, 255, 0.55);
        font-family: inherit;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        cursor: pointer;
        padding: 0;
      }
      .tray-section-link:hover { color: #fff; }

      /* Recent grid */
      .tray-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 8px;
      }
      .tray-card {
        background: rgba(255, 255, 255, 0.035);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 13px;
        padding: 12px 12px 11px;
        cursor: pointer;
        font-family: inherit;
        text-align: left;
        color: #fff;
        transition: background 0.12s ease, border-color 0.12s ease;
        min-width: 0;
      }
      .tray-card:hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(255, 255, 255, 0.14);
      }
      .tray-card-icon {
        width: 26px; height: 26px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.06);
        object-fit: cover;
        margin-bottom: 8px;
        display: block;
      }
      .tray-card-icon-fallback {
        display: flex; align-items: center; justify-content: center;
        font-size: 10px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.55);
      }
      .tray-card-name {
        margin: 0;
        font-size: 12.5px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tray-card-meta {
        margin: 2px 0 0;
        font-size: 10.5px;
        color: rgba(255, 255, 255, 0.4);
      }

      /* Bot list rows */
      .tray-bot-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
      .tray-bot-row {
        display: flex; align-items: center; gap: 11px;
        padding: 9px 10px;
        border-radius: 11px;
        background: rgba(255, 255, 255, 0.025);
        border: 1px solid rgba(255, 255, 255, 0.05);
        cursor: pointer;
        font-family: inherit;
        text-align: left;
        color: #fff;
        transition: background 0.12s ease, border-color 0.12s ease;
      }
      .tray-bot-row:hover {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.12);
      }
      .tray-bot-icon {
        width: 28px; height: 28px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.7);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .tray-bot-body { flex: 1; min-width: 0; }
      .tray-bot-label {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
      }
      .tray-bot-meta {
        margin: 2px 0 0;
        font-size: 10.5px;
        color: rgba(255, 255, 255, 0.45);
        display: flex; align-items: center; gap: 5px;
      }
      .tray-bot-state {
        color: rgba(255, 255, 255, 0.45);
        font-weight: 600;
      }
      .tray-bot-state.ok { color: var(--ds-status-ok); }
      .tray-bot-arrow {
        color: rgba(255, 255, 255, 0.22);
        flex-shrink: 0;
      }
      .tray-bot-row:hover .tray-bot-arrow { color: rgba(255, 255, 255, 0.55); }

      /* Search results list */
      .tray-results { display: flex; flex-direction: column; gap: 3px; padding-bottom: 8px; }
      .tray-empty {
        padding: 24px 12px;
        text-align: center;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.32);
        margin: 0;
      }
      .tray-row {
        width: 100%;
        background: rgba(255, 255, 255, 0.025);
        border: 1px solid rgba(255, 255, 255, 0.05);
        text-align: left;
        font-family: inherit;
        display: flex; align-items: center; gap: 10px;
        padding: 8px 10px;
        border-radius: 10px;
        cursor: pointer;
        color: #fff;
        transition: background 0.12s ease;
      }
      .tray-row:hover { background: rgba(255, 255, 255, 0.06); }
      .tray-row-icon {
        width: 28px; height: 28px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        object-fit: cover;
        flex-shrink: 0;
      }
      .tray-row-icon-fallback {
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 11px;
        color: rgba(255, 255, 255, 0.55);
      }
      .tray-row-body { flex: 1; min-width: 0; }
      .tray-row-name {
        margin: 0;
        font-size: 12.5px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: flex; align-items: center; gap: 6px;
      }
      .tray-row-crown { color: rgb(251, 191, 36); flex-shrink: 0; }
      .tray-row-meta {
        margin: 1px 0 0;
        font-size: 10px;
        color: rgba(255, 255, 255, 0.42);
        display: flex; align-items: center; gap: 4px;
      }
      .tray-row-ok { color: var(--ds-status-ok); }
      .tray-bot-avatar { width: 18px; height: 18px; border-radius: 5px; object-fit: cover; }
      .tray-bot-avatar-xs { width: 10px; height: 10px; border-radius: 3px; object-fit: cover; flex-shrink: 0; }
      .tray-row-arrow { color: rgba(255, 255, 255, 0.22); flex-shrink: 0; }
      .tray-row:hover .tray-row-arrow { color: rgba(255, 255, 255, 0.5); }

      .tray-error {
        margin: 0 14px 8px;
        padding: 10px 12px;
        background: rgba(239, 68, 68, 0.08);
        border: 1px solid rgba(239, 68, 68, 0.25);
        border-radius: 10px;
        color: rgb(252, 165, 165);
        font-size: 11.5px;
      }

      /* Footer */
      .tray-footer {
        padding: 9px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        display: flex; align-items: center; gap: 6px;
        font-size: 10.5px;
        color: rgba(255, 255, 255, 0.35);
        flex-shrink: 0;
        background: rgba(255, 255, 255, 0.015);
      }
      .tray-online {
        display: inline-flex; align-items: center; gap: 5px;
        color: var(--ds-status-ok);
        font-weight: 600;
      }
      .tray-dot {
        width: 5px; height: 5px;
        border-radius: 50%;
        background: var(--ds-status-ok);
        box-shadow: 0 0 6px rgba(var(--ds-status-ok-rgb), 0.7);
      }
      .tray-sep { color: rgba(255, 255, 255, 0.18); }
      .tray-foot-version { margin-left: auto; font-family: ui-monospace, "SF Mono", monospace; font-size: 10px; }
    `}</style>
  );
}
