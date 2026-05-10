import { useEffect, useMemo, useState } from "react";
import {
  Shield, Zap, Search, ArrowUpRight, Power, ExternalLink, Circle,
  ChevronRight,
} from "lucide-react";
import { apiGet, setBearerToken } from "@/api/client";
import { tokenGet, openExternal } from "@/lib/desktop";

/**
 * Tray-icon popover — small 340×440 window that pops below the menu bar
 * when the user clicks the Shardtown tray icon. NordVPN / Claude style.
 *
 * Lives in its own URL (?panel=tray) so it can mount without the full
 * sidebar shell. Loads its own bearer token from the keychain at start
 * — same trust model as the main window.
 */

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  bot_present: boolean;
}

interface SummaryData {
  shardguard: Guild[];
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
        if (!cancelled) setError("Non connecté. Ouvre l'app pour te connecter.");
        return;
      }
      setBearerToken(token);
      try {
        const [sg, s] = await Promise.all([
          apiGet<{ guilds: Guild[] }>("/api/account/guilds?bot=shardguard"),
          apiGet<{ guilds: Guild[] }>("/api/account/guilds?bot=shard"),
        ]);
        if (!cancelled) setData({ shardguard: sg.guilds, shard: s.guilds });
      } catch {
        if (!cancelled) setError("Erreur de connexion.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Combined list — used both for the search and the "X serveurs" tile.
  const allGuilds = useMemo(() => {
    if (!data) return [];
    return [
      ...data.shardguard.map(g => ({ ...g, bot: "shardguard" as const })),
      ...data.shard.map(g => ({ ...g, bot: "shard" as const })),
    ];
  }, [data]);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allGuilds.filter(g => g.name.toLowerCase().includes(q)).slice(0, 8);
  }, [allGuilds, query]);

  const sgActive = data?.shardguard.filter(g => g.bot_present).length ?? 0;
  const sgTotal = data?.shardguard.length ?? 0;
  const sActive = data?.shard.filter(g => g.bot_present).length ?? 0;
  const sTotal = data?.shard.length ?? 0;

  function openMain(path = "/outils") {
    openExternal(`shardtown://open${path}`).catch(() => {});
    // The protocol handler isn't wired (yet); as a fallback we just
    // open the web equivalent so the user can still get there.
    openExternal(`https://shardtwn.fr${path}`).catch(() => {});
  }

  return (
    <div className="tray-panel">
      <div className="tray-drag" data-tauri-drag-region />

      {/* Search */}
      <div className="tray-search">
        <Search size={13} strokeWidth={2} />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Rechercher un serveur, une action…"
          autoFocus
          spellCheck={false}
        />
        {query && (
          <button type="button" className="tray-search-clear" onClick={() => setQuery("")}>
            ✕
          </button>
        )}
      </div>

      {error && <div className="tray-error">{error}</div>}

      {/* Search results (only when typing) */}
      {query && (
        <div className="tray-results">
          {filtered.length === 0 ? (
            <p className="tray-empty">Aucun serveur ne correspond.</p>
          ) : (
            filtered.map(g => (
              <TrayGuildRow key={`${g.bot}:${g.id}`} guild={g} />
            ))
          )}
        </div>
      )}

      {/* Status when not searching */}
      {!query && (
        <>
          <div className="tray-section-label">Bots</div>
          <BotStatusRow
            icon={<Shield size={13} strokeWidth={2} />}
            label="ShardGuard"
            active={sgActive}
            total={sgTotal}
          />
          <BotStatusRow
            icon={<Zap size={13} strokeWidth={2} />}
            label="Shard"
            active={sActive}
            total={sTotal}
          />

          <div className="tray-section-label">Accès rapide</div>
          <TrayActionRow
            icon={<ArrowUpRight size={13} strokeWidth={2} />}
            label="Ouvrir le tableau de bord"
            onClick={() => openMain("/outils")}
          />
          <TrayActionRow
            icon={<Shield size={13} strokeWidth={2} />}
            label="Configurer ShardGuard"
            onClick={() => openMain("/shardguard/server")}
          />
          <TrayActionRow
            icon={<Zap size={13} strokeWidth={2} />}
            label="Configurer Shard"
            onClick={() => openMain("/shard/server")}
          />
        </>
      )}

      <div className="tray-footer">
        <span className="tray-online">
          <Circle size={6} fill="rgb(74, 222, 128)" stroke="none" />
          Connecté
        </span>
        <span className="tray-sep">·</span>
        <button
          type="button"
          className="tray-foot-btn"
          onClick={() => {
            // Quitter l'app — just close the panel, the user can ⌘Q
            // from the main window if they want to fully quit.
            if (typeof window !== "undefined") window.close();
          }}
        >
          <Power size={10} strokeWidth={2} /> Fermer
        </button>
      </div>

      <TrayStyles />
    </div>
  );
}

function TrayGuildRow({
  guild,
}: {
  guild: Guild & { bot: "shardguard" | "shard" };
}) {
  const BotIcon = guild.bot === "shardguard" ? Shield : Zap;
  const iconUrl = guild.icon
    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=48`
    : null;
  const initials = guild.name[0]?.toUpperCase() ?? "?";

  return (
    <button
      type="button"
      className="tray-row"
      onClick={() => openExternal(`https://shardtwn.fr/${guild.bot}/guild/${guild.id}`).catch(() => {})}
    >
      {iconUrl ? (
        <img src={iconUrl} alt="" className="tray-row-icon" />
      ) : (
        <div className="tray-row-icon tray-row-icon-fallback">{initials}</div>
      )}
      <div className="tray-row-body">
        <p className="tray-row-name">{guild.name}</p>
        <p className="tray-row-meta">
          <BotIcon size={9} strokeWidth={2} />
          {guild.bot === "shardguard" ? "ShardGuard" : "Shard"}
          {guild.bot_present && <span className="tray-row-ok">· Configuré</span>}
        </p>
      </div>
      <ChevronRight size={12} strokeWidth={2} className="tray-row-arrow" />
    </button>
  );
}

function BotStatusRow({
  icon, label, active, total,
}: {
  icon: React.ReactNode;
  label: string;
  active: number;
  total: number;
}) {
  return (
    <div className="tray-status">
      <span className="tray-status-icon">{icon}</span>
      <span className="tray-status-label">{label}</span>
      <span className="tray-status-value">
        <span className="tray-status-active">{active}</span>
        <span className="tray-status-slash">/{total}</span>
      </span>
      <span className={`tray-status-dot ${active > 0 ? "ok" : ""}`} />
    </div>
  );
}

function TrayActionRow({
  icon, label, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="tray-action" onClick={onClick}>
      <span className="tray-action-icon">{icon}</span>
      <span className="tray-action-label">{label}</span>
      <ExternalLink size={10} strokeWidth={2} className="tray-action-ext" />
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
        height: calc(100% - 24px);
        margin: 8px 12px 16px;
        background: #15161b;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 18px;
        box-shadow:
          0 24px 60px -10px rgba(0, 0, 0, 0.5),
          0 8px 20px -5px rgba(0, 0, 0, 0.35);
        color: #f5f5f7;
        font-family: -apple-system, "SF Pro Display", "SF Pro Text", system-ui, sans-serif;
        font-size: 13px;
        display: flex; flex-direction: column;
        overflow: hidden;
      }
      .tray-drag {
        height: 8px; flex-shrink: 0;
        -webkit-app-region: drag;
      }
      .tray-search {
        margin: 4px 12px 10px;
        padding: 9px 12px;
        background: rgba(255, 255, 255, 0.035);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        display: flex; align-items: center; gap: 9px;
        color: rgba(255, 255, 255, 0.55);
      }
      .tray-search input {
        flex: 1;
        background: none;
        border: none;
        outline: none;
        color: #fff;
        font-size: 13px;
        font-family: inherit;
      }
      .tray-search input::placeholder { color: rgba(255, 255, 255, 0.3); }
      .tray-search-clear {
        background: none; border: none; cursor: pointer;
        color: rgba(255, 255, 255, 0.38);
        font-size: 11px;
        padding: 2px 4px;
      }
      .tray-search-clear:hover { color: #fff; }

      .tray-section-label {
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.32);
        padding: 6px 16px 6px;
      }
      .tray-section-label:not(:first-of-type) { padding-top: 14px; }

      .tray-status {
        display: flex; align-items: center; gap: 10px;
        margin: 0 8px;
        padding: 9px 8px;
        border-radius: 8px;
        color: #fff;
      }
      .tray-status:hover { background: rgba(255, 255, 255, 0.035); }
      .tray-status-icon {
        color: rgba(255, 255, 255, 0.55);
        width: 13px; display: flex;
      }
      .tray-status-label { flex: 1; font-size: 13px; font-weight: 500; }
      .tray-status-value {
        font-variant-numeric: tabular-nums;
        font-size: 12.5px;
      }
      .tray-status-active { font-weight: 600; color: #fff; }
      .tray-status-slash { color: rgba(255, 255, 255, 0.32); }
      .tray-status-dot {
        width: 7px; height: 7px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
      }
      .tray-status-dot.ok {
        background: rgb(74, 222, 128);
        box-shadow: 0 0 8px rgba(74, 222, 128, 0.6);
      }

      .tray-action {
        width: calc(100% - 16px);
        margin: 0 8px;
        padding: 9px 10px;
        border: none;
        background: none;
        color: #fff;
        font-size: 13px;
        font-family: inherit;
        text-align: left;
        display: flex; align-items: center; gap: 11px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.12s ease;
      }
      .tray-action:hover { background: rgba(255, 255, 255, 0.05); }
      .tray-action-icon {
        color: rgba(255, 255, 255, 0.55);
        width: 13px; display: flex;
      }
      .tray-action-label { flex: 1; font-weight: 500; }
      .tray-action-ext {
        color: rgba(255, 255, 255, 0.22);
        transition: color 0.12s ease, transform 0.12s ease;
      }
      .tray-action:hover .tray-action-ext {
        color: rgba(255, 255, 255, 0.5);
        transform: translateX(1px);
      }

      .tray-results { overflow-y: auto; padding: 4px 8px; }
      .tray-empty {
        padding: 24px 12px;
        text-align: center;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.32);
        margin: 0;
      }
      .tray-row {
        width: 100%;
        background: none;
        border: none;
        text-align: left;
        font-family: inherit;
        display: flex; align-items: center; gap: 10px;
        padding: 8px 10px;
        border-radius: 8px;
        cursor: pointer;
        color: #fff;
      }
      .tray-row:hover { background: rgba(255, 255, 255, 0.05); }
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
        font-weight: 700; font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
      }
      .tray-row-body { flex: 1; min-width: 0; }
      .tray-row-name {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tray-row-meta {
        margin: 1px 0 0;
        font-size: 10.5px;
        color: rgba(255, 255, 255, 0.45);
        display: flex; align-items: center; gap: 4px;
      }
      .tray-row-ok { color: rgb(74, 222, 128); }
      .tray-row-arrow {
        color: rgba(255, 255, 255, 0.22);
        flex-shrink: 0;
      }
      .tray-row:hover .tray-row-arrow {
        color: rgba(255, 255, 255, 0.5);
      }

      .tray-error {
        margin: 0 12px 8px;
        padding: 10px 12px;
        background: rgba(239, 68, 68, 0.08);
        border: 1px solid rgba(239, 68, 68, 0.25);
        border-radius: 8px;
        color: rgb(252, 165, 165);
        font-size: 11.5px;
      }

      .tray-footer {
        margin-top: auto;
        padding: 10px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        display: flex; align-items: center; gap: 8px;
        font-size: 10.5px;
        color: rgba(255, 255, 255, 0.38);
      }
      .tray-online {
        display: inline-flex; align-items: center; gap: 5px;
        color: rgb(74, 222, 128);
        font-weight: 600;
      }
      .tray-sep { color: rgba(255, 255, 255, 0.18); }
      .tray-foot-btn {
        background: none; border: none;
        color: rgba(255, 255, 255, 0.45);
        font-family: inherit;
        font-size: 10.5px;
        cursor: pointer;
        margin-left: auto;
        display: inline-flex; align-items: center; gap: 4px;
      }
      .tray-foot-btn:hover { color: #fff; }
    `}</style>
  );
}
