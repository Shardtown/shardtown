import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutGrid, Sparkles, Settings, HelpCircle,
  Search, Bell, User, LogOut, X, MessageCircle, Activity, Download, Loader2,
} from "lucide-react";
import { useAuth, avatarUrl } from "@/api/auth";
import {
  tokenClear, biometricConfirm, openExternal, IS_DESKTOP,
  checkForUpdate, downloadAndInstallUpdate,
  type UpdateInfo, type UpdateProgress,
} from "@/lib/desktop";
import { apiGet, apiPost, setBearerToken } from "@/api/client";
import { disableDemoMode, isDemoMode } from "@/lib/demo";

/**
 * Desktop chrome — full NordVPN-style redesign.
 *
 * Layout:
 *   ┌────┬─────────────────────────────────────────┐
 *   │ ⊞ │  [  🔍 search bar (centered)  ]  🔔  👤 │  ← top bar
 *   │ 🛡│                                          │
 *   │ ⚡│            main content                  │
 *   │ ✨│         (full-bleed cards)               │
 *   │ ⚙ │                                          │
 *   │   │                                          │
 *   │ ? │                                          │
 *   └────┴─────────────────────────────────────────┘
 *
 * Sidebar is 76px wide, icons only. Active item has a rounded square
 * highlight. Help anchored at the bottom. The top bar holds the search
 * + bell + profile cluster.
 */

interface NavSpec {
  to: string;
  icon: ReactNode;
  label: string;
}

interface NavGroup {
  /** Tiny uppercase label rendered above the group (omit for the first group). */
  label?: string;
  items: NavSpec[];
}

export function DesktopShell({ children }: { children: ReactNode }) {
  const { user, refresh } = useAuth();
  const location = useLocation();
  const nav = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const displayName = user?.global_name || user?.username || "Compte";

  function isActive(prefix: string) {
    return location.pathname === prefix || location.pathname.startsWith(prefix + "/");
  }

  const groups: NavGroup[] = [
    {
      items: [
        { to: "/outils",    icon: <LayoutGrid    size={18} strokeWidth={1.8} />, label: "Tableau de bord" },
        { to: "/assistant", icon: <MessageCircle size={18} strokeWidth={1.8} />, label: "Samia" },
      ],
    },
    {
      label: "Bots",
      items: [
        { to: "/shardguard/server", icon: <BotAvatar src="/image/shardguard.png" size={22} alt="ShardGuard" />, label: "ShardGuard" },
        { to: "/shard/server",      icon: <BotAvatar src="/image/shard.png"      size={22} alt="Shard" />,     label: "Shard" },
      ],
    },
    {
      label: "Statut",
      items: [
        { to: "/statut", icon: <Activity size={18} strokeWidth={1.8} />, label: "Statut des services" },
      ],
    },
    {
      label: "Système",
      items: [
        { to: "/rpc",         icon: <Sparkles size={18} strokeWidth={1.8} />, label: "Discord RPC" },
        { to: "/preferences", icon: <Settings size={18} strokeWidth={1.8} />, label: "Préférences" },
      ],
    },
  ];

  async function logout() {
    setProfileOpen(false);
    if (IS_DESKTOP && !isDemoMode()) {
      const ok = await biometricConfirm("Confirme avec Touch ID pour te déconnecter");
      if (!ok) return;
    }
    await apiPost("/api/account/logout").catch(() => {});
    if (IS_DESKTOP) {
      setBearerToken(null);
      await tokenClear().catch(() => {});
      disableDemoMode();
    }
    refresh();
    window.location.reload();
  }

  return (
    <div
      className="h-screen w-screen flex overflow-hidden"
      style={{ background: "var(--ds-bg)", color: "var(--ds-text)" }}
    >
      {/* Drag region — invisible strip at the top of the window */}
      <div className="fixed inset-x-0 top-0 h-7 z-50 pointer-events-none" data-tauri-drag-region />

      {/* ─── SIDEBAR ──────────────────────────────────────────────── */}
      <aside
        className="w-[76px] flex-shrink-0 flex flex-col items-center pt-9 pb-3 select-none border-r"
        style={{ background: "var(--ds-bg-1)", borderColor: "var(--ds-border)" }}
      >
        {/* Static Shardtown logo at the top of the rail */}
        <Link
          to="/outils"
          aria-label="Tableau de bord"
          title="Shardtown"
          className="w-10 h-10 flex items-center justify-center mb-6 transition-opacity hover:opacity-90"
        >
          <img src="/image/favicon.png" alt="Shardtown" className="w-6 h-6 object-contain" />
        </Link>

        <nav className="flex flex-col gap-1.5 w-10">
          {groups.map((group, gi) => (
            <div key={gi} className="flex flex-col gap-1.5">
              {gi > 0 && (
                <div
                  className="mx-auto w-6 h-px my-2"
                  style={{ background: "var(--ds-border)" }}
                  aria-hidden
                />
              )}
              {group.items.map(item => (
                <RailItem
                  key={item.to}
                  to={item.to}
                  icon={item.icon}
                  label={item.label}
                  active={isActive(item.to)}
                />
              ))}
            </div>
          ))}
        </nav>

        <div className="mt-auto">
          <button
            type="button"
            onClick={() => openExternal("https://shardtwn.fr/wiki").catch(() => {})}
            aria-label="Aide"
            title="Aide"
            className="w-10 h-10 rounded-[12px] flex items-center justify-center transition-colors hover:opacity-80"
            style={{ color: "var(--ds-text-dim)" }}
          >
            <HelpCircle size={18} strokeWidth={1.8} />
          </button>
        </div>
      </aside>

      {/* ─── RIGHT PANE: TOP BAR + CONTENT ─────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header
          className="h-[64px] flex-shrink-0 flex items-center gap-3 px-6 border-b"
          style={{ borderColor: "var(--ds-border)", background: "var(--ds-bg)" }}
        >
          <div className="flex-1 flex justify-center">
            <SearchBox open={searchOpen} setOpen={setSearchOpen} onNavigate={nav} />
          </div>
          <UpdateButton />
          <button
            type="button"
            aria-label="Notifications"
            className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--ds-panel-2)]"
            style={{ background: "var(--ds-panel)", border: "1px solid var(--ds-border)", color: "var(--ds-text)" }}
          >
            <Bell size={15} strokeWidth={1.8} />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen(o => !o)}
              aria-label="Profil"
              className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center transition-opacity hover:opacity-80"
              style={{ background: "var(--ds-panel)", border: "1px solid var(--ds-border)" }}
            >
              {user
                ? <img src={avatarUrl(user, 64)} alt="" className="w-full h-full object-cover" />
                : <User size={15} strokeWidth={1.8} style={{ color: "var(--ds-text)" }} />}
            </button>
            {profileOpen && (
              <ProfileMenu
                displayName={displayName}
                username={user?.username}
                avatar={user ? avatarUrl(user, 96) : null}
                onClose={() => setProfileOpen(false)}
                onLogout={logout}
                onAccount={() => { setProfileOpen(false); nav("/account"); }}
                onPreferences={() => { setProfileOpen(false); nav("/preferences"); }}
                onHelp={() => { setProfileOpen(false); openExternal("https://shardtwn.fr/wiki").catch(() => {}); }}
              />
            )}
          </div>
        </header>

        {/* Main content area — scrolls, full-bleed (pages decide their own widths) */}
        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="w-full px-8 pt-8 pb-16">{children}</div>
        </main>
      </div>
    </div>
  );
}

function RailItem({
  to, icon, label, active,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      title={label}
      aria-label={label}
      className="w-10 h-10 rounded-[12px] flex items-center justify-center transition-colors group"
      style={
        active
          ? { background: "var(--ds-panel-hi)", color: "var(--ds-text)", border: "1px solid var(--ds-border)" }
          : { color: "var(--ds-text-dim)" }
      }
    >
      <span style={active ? undefined : { transition: "color 0.12s ease" }}>
        {icon}
      </span>
    </Link>
  );
}

function ProfileMenu({
  displayName, username, avatar,
  onClose, onLogout, onAccount, onPreferences, onHelp,
}: {
  displayName: string;
  username?: string;
  avatar: string | null;
  onClose: () => void;
  onLogout: () => void;
  onAccount: () => void;
  onPreferences: () => void;
  onHelp: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-profile-menu]") && !target.closest("[aria-label='Profil']")) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  return (
    <div
      data-profile-menu
      className="absolute z-50 right-0 top-[calc(100%+10px)] w-[280px] rounded-[16px] border overflow-hidden profile-pop"
      style={{
        background: "var(--ds-bg-1)",
        borderColor: "var(--ds-border-strong)",
        boxShadow: "0 24px 60px -12px rgba(0,0,0,0.55)",
      }}
    >
      {/* NordVPN-style header: avatar + name + handle */}
      <div className="px-4 pt-4 pb-4 flex items-center gap-3 border-b" style={{ borderColor: "var(--ds-border)" }}>
        <div
          className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)" }}
        >
          {avatar
            ? <img src={avatar} alt="" className="w-full h-full object-cover" />
            : <User size={18} strokeWidth={2} style={{ color: "var(--ds-text-mut)" }} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold truncate">{displayName}</p>
          {username && (
            <p className="text-[11.5px] truncate" style={{ color: "var(--ds-text-dim)" }}>@{username}</p>
          )}
        </div>
      </div>

      {/* Menu items */}
      <div className="py-1.5">
        <MenuRow icon={<User size={15} strokeWidth={1.8} />}     label="Compte"      onClick={onAccount} />
        <MenuRow icon={<Settings size={15} strokeWidth={1.8} />} label="Réglages"    onClick={onPreferences} />
        <MenuRow icon={<HelpCircle size={15} strokeWidth={1.8} />} label="Aide"      onClick={onHelp} />
      </div>

      <div className="border-t py-1.5" style={{ borderColor: "var(--ds-border)" }}>
        <MenuRow icon={<LogOut size={15} strokeWidth={1.8} />} label="Déconnexion" onClick={onLogout} danger />
      </div>

      <style>{`
        .profile-pop { animation: prof-in 160ms cubic-bezier(0.22, 1, 0.36, 1); transform-origin: top right; }
        @keyframes prof-in {
          from { opacity: 0; transform: scale(0.96) translateY(-4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

function MenuRow({
  icon, label, onClick, danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-4 py-2.5 text-[13.5px] font-semibold transition-colors hover:bg-[var(--ds-panel)] flex items-center gap-3"
      style={{ color: danger ? "rgb(248, 113, 113)" : "var(--ds-text)" }}
    >
      <span style={{ color: danger ? "rgb(248, 113, 113)" : "var(--ds-text-mut)" }}>{icon}</span>
      {label}
    </button>
  );
}

/* ─── Search box (with ⌘K) ────────────────────────────────────────── */

interface SearchHit {
  label: string;
  hint: string;
  path: string;
}

function SearchBox({
  open, setOpen, onNavigate,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onNavigate: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);

  // ⌘K global shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => document.getElementById("topbar-search")?.focus(), 0);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  // Search hits — locations (page actions) + live guild search
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) { setHits([]); return; }

    const locations: SearchHit[] = [
      { label: "Tableau de bord",        hint: "Vue d'ensemble",         path: "/outils" },
      { label: "ShardGuard · Serveurs",  hint: "Sécurité Discord",       path: "/shardguard/server" },
      { label: "Shard · Serveurs",       hint: "Communauté",             path: "/shard/server" },
      { label: "Samia",                  hint: "Assistante IA",          path: "/assistant" },
      { label: "Discord RPC",            hint: "Rich Presence",          path: "/rpc" },
      { label: "Préférences",            hint: "Sons, Touch ID, thème",  path: "/preferences" },
      { label: "Statut des services",    hint: "Surveillance temps réel", path: "/statut" },
      { label: "Mon compte",             hint: "Profil & connexions",    path: "/account" },
    ];
    const matched = locations.filter(l =>
      l.label.toLowerCase().includes(q) || l.hint.toLowerCase().includes(q)
    );

    // Pull live guilds for in-search navigation
    let cancelled = false;
    (async () => {
      try {
        const [sg, s] = await Promise.all([
          apiGet<{ guilds: { id: string; name: string }[] }>("/api/account/guilds?bot=shardguard").catch(() => ({ guilds: [] })),
          apiGet<{ guilds: { id: string; name: string }[] }>("/api/account/guilds?bot=shard").catch(() => ({ guilds: [] })),
        ]);
        const guilds: SearchHit[] = [
          ...sg.guilds.map(g => ({ label: g.name, hint: "ShardGuard · " + g.id, path: `/shardguard/guild/${g.id}` })),
          ...s.guilds.map(g => ({ label: g.name, hint: "Shard · " + g.id, path: `/shard/guild/${g.id}` })),
        ].filter(h => h.label.toLowerCase().includes(q));

        // Dedup by path
        const all = [...matched];
        for (const g of guilds) if (!all.some(a => a.path === g.path)) all.push(g);
        if (!cancelled) setHits(all.slice(0, 8));
      } catch {
        if (!cancelled) setHits(matched);
      }
    })();
    return () => { cancelled = true; };
  }, [query]);

  function selectHit(hit: SearchHit) {
    onNavigate(hit.path);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative w-full max-w-[560px]">
      <div
        className="flex items-center gap-2.5 h-[42px] px-4 rounded-full border cursor-text transition-colors"
        style={{
          background: open ? "var(--ds-panel-2)" : "var(--ds-panel)",
          borderColor: open ? "var(--ds-border-strong)" : "var(--ds-border)",
        }}
        onClick={() => {
          setOpen(true);
          setTimeout(() => document.getElementById("topbar-search")?.focus(), 0);
        }}
      >
        <Search size={14} strokeWidth={2} style={{ color: "var(--ds-text-dim)" }} />
        <input
          id="topbar-search"
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Rechercher un serveur, une action…  (⌘K)"
          spellCheck={false}
          className="flex-1 bg-transparent outline-none text-[13.5px]"
          style={{ color: "var(--ds-text)" }}
        />
        {query && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setQuery(""); }}
            className="opacity-60 hover:opacity-100"
            aria-label="Effacer"
          >
            <X size={12} strokeWidth={2.4} />
          </button>
        )}
      </div>

      {open && (query.trim() !== "" || hits.length > 0) && (
        <div
          className="absolute z-40 top-[calc(100%+6px)] left-0 right-0 rounded-[14px] border overflow-hidden search-pop"
          style={{
            background: "var(--ds-bg-1)",
            borderColor: "var(--ds-border-strong)",
            boxShadow: "0 20px 60px -10px rgba(0,0,0,0.45)",
          }}
        >
          {hits.length === 0 ? (
            <p className="px-4 py-5 text-[12.5px] text-center" style={{ color: "var(--ds-text-dim)" }}>
              Aucun résultat pour « {query} »
            </p>
          ) : (
            <ul>
              {hits.map((h, i) => (
                <li key={`${h.path}-${i}`}>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => selectHit(h)}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors hover:bg-[var(--ds-panel)]"
                  >
                    <span
                      className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center flex-shrink-0"
                      style={{ background: "var(--ds-panel-2)", color: "var(--ds-text-mut)" }}
                    >
                      <Search size={11} strokeWidth={2} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold truncate">{h.label}</span>
                      <span className="block text-[11.5px] truncate" style={{ color: "var(--ds-text-dim)" }}>
                        {h.hint}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <style>{`
        .search-pop { animation: search-in 160ms cubic-bezier(0.22, 1, 0.36, 1); transform-origin: top center; }
        @keyframes search-in {
          from { opacity: 0; transform: scale(0.98) translateY(-4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

/**
 * Bot avatar — used in the rail and anywhere we'd otherwise show a
 * Shield/Zap lucide icon for ShardGuard or Shard. Loads from the
 * bundled /image/{shardguard,shard}.png so it works offline + in demo.
 */
function BotAvatar({ src, size, alt }: { src: string; size: number; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      style={{ width: size, height: size }}
      className="rounded-[7px] object-cover"
    />
  );
}

/* ─── Update button ──────────────────────────────────────────────────────
 *
 * Sits between the search box and the bell. Invisible until the Tauri
 * updater reports a newer version on the public manifest. Click → downloads,
 * verifies signature, installs and relaunches. Polls every 30 min after the
 * initial check at startup.
 */
function UpdateButton() {
  const [available, setAvailable] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgress>({ kind: "idle" });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!IS_DESKTOP) return;
    let cancelled = false;
    async function poll() {
      const u = await checkForUpdate();
      if (!cancelled) setAvailable(u);
    }
    poll();
    const id = setInterval(poll, 30 * 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-update-menu]") && !t.closest("[data-update-btn]")) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!IS_DESKTOP || !available) return null;

  const isBusy =
    progress.kind === "checking" ||
    progress.kind === "downloading" ||
    progress.kind === "installing";

  async function install() {
    setMenuOpen(false);
    try {
      await downloadAndInstallUpdate(setProgress);
    } catch (e) {
      setProgress({ kind: "error", message: (e as Error)?.message || "Erreur d'installation" });
    }
  }

  const pct =
    progress.kind === "downloading" && progress.total
      ? Math.round((progress.downloaded / progress.total) * 100)
      : null;

  return (
    <div className="relative">
      <button
        type="button"
        data-update-btn
        aria-label={`Mise à jour ${available.version} disponible`}
        title={`Mise à jour ${available.version} disponible`}
        disabled={isBusy}
        onClick={() => setMenuOpen(o => !o)}
        className="relative w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--ds-panel-2)] disabled:cursor-wait"
        style={{
          background: "rgba(91, 109, 255, 0.12)",
          border: "1px solid rgba(91, 109, 255, 0.35)",
          color: "rgb(165, 180, 252)",
        }}
      >
        {isBusy ? (
          <Loader2 size={15} strokeWidth={2} className="animate-spin" />
        ) : (
          <Download size={15} strokeWidth={2} />
        )}
        <span
          className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
          style={{
            background: "rgb(91, 109, 255)",
            boxShadow: "0 0 8px rgb(91, 109, 255)",
            display: isBusy ? "none" : undefined,
          }}
        />
      </button>

      {menuOpen && !isBusy && (
        <div
          data-update-menu
          className="absolute z-50 right-0 top-[calc(100%+10px)] w-[300px] rounded-[14px] border overflow-hidden"
          style={{
            background: "var(--ds-bg-1)",
            borderColor: "var(--ds-border-strong)",
            boxShadow: "0 22px 50px -10px rgba(0,0,0,0.5)",
          }}
        >
          <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: "var(--ds-border)" }}>
            <p className="text-[11px] font-bold tracking-[0.18em] uppercase" style={{ color: "rgb(165, 180, 252)" }}>
              Mise à jour disponible
            </p>
            <p className="text-[15px] font-extrabold tracking-tight mt-1">Version {available.version}</p>
            {available.notes && (
              <p
                className="text-[11.5px] font-medium mt-2 line-clamp-4 whitespace-pre-line"
                style={{ color: "var(--ds-text-mut)" }}
              >
                {available.notes}
              </p>
            )}
          </div>
          <div className="p-2 flex gap-2">
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="flex-1 h-9 rounded-[10px] text-[12.5px] font-bold transition-colors hover:bg-[var(--ds-panel)]"
              style={{ color: "var(--ds-text-mut)" }}
            >
              Plus tard
            </button>
            <button
              type="button"
              onClick={install}
              className="flex-1 h-9 rounded-[10px] text-[12.5px] font-bold transition-opacity hover:opacity-90 inline-flex items-center justify-center gap-1.5"
              style={{ background: "rgb(91, 109, 255)", color: "#fff" }}
            >
              <Download size={12} strokeWidth={2.4} />
              Installer
            </button>
          </div>
        </div>
      )}

      {/* Progress popover during download */}
      {isBusy && (
        <div
          className="absolute z-50 right-0 top-[calc(100%+10px)] w-[280px] rounded-[14px] border px-4 py-3"
          style={{
            background: "var(--ds-bg-1)",
            borderColor: "var(--ds-border-strong)",
            boxShadow: "0 22px 50px -10px rgba(0,0,0,0.5)",
          }}
        >
          <p className="text-[12.5px] font-bold">
            {progress.kind === "downloading"
              ? `Téléchargement ${pct !== null ? `· ${pct}%` : "…"}`
              : progress.kind === "installing"
                ? "Installation…"
                : "Vérification…"}
          </p>
          <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--ds-panel-2)" }}>
            <div
              className="h-full transition-[width] duration-200"
              style={{
                width: pct !== null ? `${pct}%` : "100%",
                background: "rgb(91, 109, 255)",
                animation: pct === null ? "update-indeterm 1.4s ease-in-out infinite" : undefined,
              }}
            />
          </div>
          <style>{`
            @keyframes update-indeterm {
              0%   { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
