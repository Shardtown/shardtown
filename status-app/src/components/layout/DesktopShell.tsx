import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutGrid, Sparkles, Settings, HelpCircle,
  Search, Bell, User, LogOut, X, MessageCircle, Activity, Download, Loader2, RefreshCw, Crown,
} from "lucide-react";
import { useAuth, avatarUrl } from "@/api/auth";
import { BackgroundGradientAnimation } from "@/components/ui/background-gradient-animation";
// TourHost + PostUpdateNotes were here before but they're now mounted at
// the App level (above <Routes>) so they survive route changes — otherwise
// every navigation remounts DesktopShell and kills the tour mid-step.
import { GreetingToast } from "@/components/GreetingToast";
import {
  PresenceProvider, PresenceStack, FieldPresenceLayer,
  FollowBanner, GhostCursors,
} from "@/components/Presence";
import { notify } from "@/lib/notifications";
import {
  tokenClear, biometricConfirm, openExternal, IS_DESKTOP,
  checkForUpdate, downloadAndInstallUpdate,
  type UpdateInfo, type UpdateProgress,
} from "@/lib/desktop";
import { apiGet, apiPost, setBearerToken } from "@/api/client";
import { disableDemoMode, isDemoMode } from "@/lib/demo";
import { useTheme } from "@/lib/theme";

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
  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  const theme = useTheme();

  const displayName = user?.global_name || user?.username || "Compte";

  // Poll premium status when the user is loaded. Cheap call (one DB query),
  // refreshed on user change so a freshly-bought premium reflects without a
  // full reload.
  useEffect(() => {
    if (!user) { setIsPremium(null); return; }
    let cancelled = false;
    apiGet<{ is_premium: boolean }>("/api/account/premium")
      .then(r => { if (!cancelled) setIsPremium(r.is_premium); })
      .catch(() => { if (!cancelled) setIsPremium(false); });
    return () => { cancelled = true; };
  }, [user]);

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
      label: "Shard",
      items: [
        { to: "/shardguard/server", icon: <BotAvatar src="/image/shard.png" size={22} alt="Shard · Sécurité" />,    label: "Shard · Sécurité" },
        { to: "/shard/server",      icon: <BotAvatar src="/image/shard.png" size={22} alt="Shard · Communauté" />, label: "Shard · Communauté" },
      ],
    },
    {
      label: "Statut",
      items: [
        { to: "/statut", icon: <Activity size={18} strokeWidth={1.8} />, label: "Statut des services" },
      ],
    },
    {
      label: "Premium",
      items: [
        { to: "/premium", icon: <Crown size={18} strokeWidth={1.8} />, label: isPremium ? "Mon abonnement Premium" : "Passer en Premium" },
      ],
    },
    {
      label: "Système",
      items: [
        { to: "/rpc",         icon: <Sparkles size={18} strokeWidth={1.8} />, label: "Discord RPC" },
        { to: "/preferences", icon: <Settings size={18} strokeWidth={1.8} />, label: "Réglages" },
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
    <PresenceProvider>
    <div
      className="h-screen w-screen flex overflow-hidden relative"
      style={{ color: "var(--ds-text)" }}
    >
      {/* Animated multi-color gradient background — uniquement quand le
          thème "aurora" est actif. En "noir" et "light" on garde une surface
          plate qui suit var(--ds-bg). */}
      {theme === "aurora" && (
        <div className="fixed inset-0 pointer-events-none -z-10 opacity-60">
          <BackgroundGradientAnimation
            interactive={false}
            gradientBackgroundStart="rgb(6, 10, 28)"
            gradientBackgroundEnd="rgb(0, 0, 0)"
            firstColor="37, 99, 235"
            secondColor="139, 92, 246"
            thirdColor="30, 64, 175"
            fourthColor="236, 72, 153"
            fifthColor="16, 185, 129"
            size="60%"
            blendingValue="screen"
            containerClassName="!h-full !w-full"
          />
        </div>
      )}

      {/* Drag region — invisible strip at the top of the window */}
      <div className="fixed inset-x-0 top-0 h-7 z-50 pointer-events-none" data-tauri-drag-region />

      {/* ─── SIDEBAR ──────────────────────────────────────────────── */}
      <aside
        className="w-[76px] flex-shrink-0 flex flex-col items-center pt-9 pb-3 select-none"
      >
        {/* Static Shardtown logo at the top of the rail */}
        <Link
          to="/outils"
          aria-label="Tableau de bord"
          title="Shardtown"
          className="w-12 h-12 flex items-center justify-center mb-7 transition-opacity hover:opacity-90"
        >
          <img src="/image/favicon.png" alt="Shardtown" className="w-10 h-10 object-contain" />
        </Link>

        <nav className="flex flex-col gap-3 w-12" data-tour="sidebar">
          {groups.map((group, gi) => (
            <div
              key={gi}
              className="flex flex-col gap-1 p-1 rounded-[16px] border ds-glass"
              style={{ borderColor: "var(--ds-border)" }}
            >
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

        <div className="mt-auto flex flex-col items-center gap-1">
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
          <AppVersion />
        </div>
      </aside>

      {/* ─── RIGHT PANE: TOP BAR + CONTENT ─────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar — search bar absolutely centered, right cluster pinned right.
            z-30 sets a stacking context so the popovers below (search,
            update, profile) stay above the scrolling page content which
            otherwise paints later in document order. */}
        <header
          className="relative z-30 h-[72px] flex-shrink-0 flex items-center justify-end gap-3 px-6"
        >
          <div
            className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2"
            data-tour="search"
          >
            <SearchBox open={searchOpen} setOpen={setSearchOpen} onNavigate={nav} />
          </div>
          <PresenceStack />
          <UpdateButton />
          <button
            type="button"
            aria-label="Notifications"
            className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--ds-panel-2)]"
            style={{ background: "var(--ds-panel)", border: "1px solid var(--ds-border)", color: "var(--ds-text)" }}
          >
            <Bell size={15} strokeWidth={1.8} />
          </button>
          <div className="relative" data-tour="profile">
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
                isPremium={isPremium}
                onClose={() => setProfileOpen(false)}
                onLogout={logout}
                onAccount={() => { setProfileOpen(false); nav("/account"); }}
                onPremium={() => { setProfileOpen(false); nav("/premium"); }}
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

      {/* Bonjour / Bonsoir — pops once par lancement avec le prénom.
          (PostUpdateNotes + TourHost ont été remontés au niveau App.tsx
          pour survivre aux changements de route — sinon chaque navigation
          remount DesktopShell et la modale du tour disparaît mid-step.) */}
      <GreetingToast />

      {/* Live presence — floating avatar + lock overlay on each input a
          peer is editing, ghost cursors for peers in fast mode, and a
          "Following X" banner when a follow session is active.
          PresenceStack in the top bar shows the per-guild stack. */}
      <FieldPresenceLayer />
      <GhostCursors />
      <FollowBanner />
    </div>
    </PresenceProvider>
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
      className={
        active
          ? "ds-glass w-10 h-10 rounded-[12px] flex items-center justify-center transition-colors group"
          : "w-10 h-10 rounded-[12px] flex items-center justify-center transition-colors group"
      }
      style={
        active
          ? {
              color: "var(--ds-text)",
              border: "1px solid var(--ds-border-strong)",
            }
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
  displayName, username, avatar, isPremium,
  onClose, onLogout, onAccount, onPremium, onPreferences, onHelp,
}: {
  displayName: string;
  username?: string;
  avatar: string | null;
  isPremium: boolean | null;
  onClose: () => void;
  onLogout: () => void;
  onAccount: () => void;
  onPremium: () => void;
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
      className="ds-glass absolute z-50 right-0 top-[calc(100%+10px)] w-[280px] rounded-[16px] border overflow-hidden profile-pop"
      style={{ borderColor: "var(--ds-border-strong)" }}
    >
      {/* NordVPN-style header: avatar + name + handle + plan badge */}
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
        {isPremium !== null && (
          <span
            className="text-[9.5px] font-bold tracking-[0.14em] uppercase px-2 py-1 rounded-full inline-flex items-center gap-1 shrink-0"
            style={
              isPremium
                ? { background: "rgba(251, 191, 36, 0.14)", color: "rgb(251, 191, 36)", border: "1px solid rgba(251, 191, 36, 0.3)" }
                : { background: "var(--ds-panel)", color: "var(--ds-text-dim)", border: "1px solid var(--ds-border)" }
            }
          >
            {isPremium && <Crown size={9} strokeWidth={2.4} />}
            {isPremium ? "Premium" : "Basique"}
          </span>
        )}
      </div>

      {/* Menu items */}
      <div className="py-1.5">
        <MenuRow icon={<User size={15} strokeWidth={1.8} />}     label="Compte"      onClick={onAccount} />
        <MenuRow
          icon={<Crown size={15} strokeWidth={1.8} />}
          label={isPremium ? "Mon Premium" : "Passer en Premium"}
          onClick={onPremium}
          accent={isPremium ? "premium" : undefined}
        />
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
  icon, label, onClick, danger, accent,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  accent?: "premium";
}) {
  const text =
    danger              ? "var(--ds-status-err)" :
    accent === "premium" ? "rgb(251, 191, 36)" :
    "var(--ds-text)";
  const iconColor =
    danger              ? "var(--ds-status-err)" :
    accent === "premium" ? "rgb(251, 191, 36)" :
    "var(--ds-text-mut)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-4 py-2.5 text-[13.5px] font-semibold transition-colors hover:bg-[var(--ds-panel)] flex items-center gap-3"
      style={{ color: text }}
    >
      <span style={{ color: iconColor }}>{icon}</span>
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
      { label: "Shard · Sécurité",    hint: "Anti-raid, captcha, modération", path: "/shardguard/server" },
      { label: "Shard · Communauté",  hint: "Niveaux, économie, giveaways",   path: "/shard/server" },
      { label: "Samia",                  hint: "Assistante IA",          path: "/assistant" },
      { label: "Discord RPC",            hint: "Rich Presence",          path: "/rpc" },
      { label: "Réglages",               hint: "Apparence, sons, Touch ID, thème",  path: "/preferences" },
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
          ...sg.guilds.map(g => ({ label: g.name, hint: "Shard · Sécurité · " + g.id, path: `/shardguard/guild/${g.id}` })),
          ...s.guilds.map(g => ({ label: g.name, hint: "Shard · Communauté · " + g.id, path: `/shard/guild/${g.id}` })),
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
    <div className="relative w-[min(720px,68vw)]">
      <div
        className="flex items-center gap-3 h-[48px] px-5 rounded-full border cursor-text transition-all duration-300 backdrop-blur-xl bg-white/[0.06] border-white/15 hover:bg-white/[0.08] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)]"
        style={{
          borderColor: open ? "rgba(255,255,255,0.22)" : undefined,
        }}
        onClick={() => {
          setOpen(true);
          setTimeout(() => document.getElementById("topbar-search")?.focus(), 0);
        }}
      >
        <Search size={16} strokeWidth={2} style={{ color: "var(--ds-text-dim)" }} />
        <input
          id="topbar-search"
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Rechercher un serveur, une action…  (⌘K)"
          spellCheck={false}
          className="flex-1 bg-transparent outline-none text-[14.5px]"
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
          className="ds-glass absolute z-40 top-[calc(100%+8px)] left-0 right-0 rounded-[14px] border overflow-hidden search-pop"
          style={{ borderColor: "var(--ds-border-strong)" }}
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

/* ─── App version label ────────────────────────────────────────────────
 *
 * Tiny version string rendered under the help icon at the bottom of the
 * rail. Reads from Tauri's runtime API (which reflects tauri.conf.json at
 * build time). Renders nothing on the web.
 */
function AppVersion() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!IS_DESKTOP) return;
    let cancelled = false;
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const v = await getVersion();
        if (!cancelled) setVersion(v);
      } catch {
        /* desktop API unavailable — skip */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!IS_DESKTOP || !version) return null;
  return (
    <span
      className="text-[9px] font-mono-num leading-none select-none"
      style={{ color: "var(--ds-text-faint)" }}
      title={`Shardtown ${version}`}
    >
      v{version}
    </span>
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
  const [checking, setChecking] = useState(false);

  const poll = useCallback(async () => {
    setChecking(true);
    try {
      const u = await checkForUpdate();
      // Native notif on transition null → available, so the user finds out
      // even if the app is in the background or another desktop space.
      setAvailable(prev => {
        if (!prev && u) {
          void notify({
            category: "updates",
            title: "Mise à jour Shardtown disponible",
            body: `Version ${u.version} prête à être installée.`,
          });
        }
        return u;
      });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!IS_DESKTOP) return;
    poll();
    const id = setInterval(poll, 30 * 60_000);
    return () => clearInterval(id);
  }, [poll]);

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

  if (!IS_DESKTOP) return null;

  const isBusy =
    progress.kind === "checking" ||
    progress.kind === "downloading" ||
    progress.kind === "installing";

  const hasUpdate = !!available;

  async function install() {
    setMenuOpen(false);
    try {
      await downloadAndInstallUpdate(setProgress);
    } catch (e) {
      const message = (e as Error)?.message || "Erreur d'installation";
      setProgress({ kind: "error", message });
      void notify({
        category: "updates",
        title: "Mise à jour Shardtown échouée",
        body: message,
      });
    }
  }

  const pct =
    progress.kind === "downloading" && progress.total
      ? Math.round((progress.downloaded / progress.total) * 100)
      : null;

  // Color logic:
  //   - update available → green
  //   - no update         → neutral (same as bell)
  //   - busy              → neutral (loader visible)
  const accentColor = hasUpdate
    ? "var(--ds-status-ok)"
    : "var(--ds-text-mut)";
  const accentBorder = hasUpdate
    ? "rgba(var(--ds-status-ok-rgb), 0.35)"
    : "var(--ds-border)";

  return (
    <div className="relative">
      <button
        type="button"
        data-update-btn
        aria-label={hasUpdate ? `Mise à jour ${available.version} disponible` : "Mises à jour"}
        title={hasUpdate ? `Mise à jour ${available.version} disponible` : "Mises à jour"}
        disabled={isBusy}
        onClick={() => setMenuOpen(o => !o)}
        className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--ds-panel-2)] disabled:cursor-wait"
        style={{
          background: "var(--ds-panel)",
          border: `1px solid ${accentBorder}`,
          color: accentColor,
        }}
      >
        {isBusy ? (
          <Loader2 size={15} strokeWidth={2.2} className="animate-spin" />
        ) : (
          <Download size={15} strokeWidth={2.2} />
        )}
      </button>

      {menuOpen && !isBusy && (
        <div
          data-update-menu
          className="ds-glass absolute z-50 right-0 top-[calc(100%+12px)] w-[320px] rounded-[18px] border overflow-hidden update-pop"
          style={{ borderColor: "var(--ds-border-strong)" }}
        >
          {/* Accent strip — green if update, neutral otherwise */}
          <div
            className="h-[3px] w-full"
            style={{ background: hasUpdate ? "var(--ds-status-ok)" : "var(--ds-border-strong)" }}
          />

          {hasUpdate ? (
            <>
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(var(--ds-status-ok-rgb), 0.12)", border: "1px solid rgba(var(--ds-status-ok-rgb), 0.28)", color: "var(--ds-status-ok)" }}
                  >
                    <Download size={16} strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[10px] font-bold tracking-[0.22em] uppercase"
                      style={{ color: "var(--ds-status-ok)" }}
                    >
                      Mise à jour disponible
                    </p>
                    <p className="text-[17px] font-extrabold tracking-tight font-mono-num leading-tight">
                      v{available.version}
                    </p>
                  </div>
                </div>
                {available.notes && (
                  <p
                    className="text-[12px] font-medium leading-relaxed whitespace-pre-line line-clamp-5"
                    style={{ color: "var(--ds-text-mut)" }}
                  >
                    {available.notes}
                  </p>
                )}
              </div>

              <div className="px-4 pb-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={install}
                  className="w-full h-10 rounded-full text-[13px] font-bold transition-opacity hover:opacity-90 inline-flex items-center justify-center gap-2"
                  style={{ background: "var(--ds-status-ok)", color: "#062e16" }}
                >
                  <Download size={13} strokeWidth={2.6} />
                  Installer maintenant
                </button>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="w-full h-8 rounded-full text-[12px] font-bold transition-colors hover:bg-[var(--ds-panel)]"
                  style={{ color: "var(--ds-text-dim)" }}
                >
                  Plus tard
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
                    style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)", color: "var(--ds-text-mut)" }}
                  >
                    <Download size={16} strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[10px] font-bold tracking-[0.22em] uppercase"
                      style={{ color: "var(--ds-text-dim)" }}
                    >
                      À jour
                    </p>
                    <p className="text-[15px] font-extrabold tracking-tight leading-tight">
                      Aucune mise à jour
                    </p>
                  </div>
                </div>
                <p className="text-[11.5px]" style={{ color: "var(--ds-text-mut)" }}>
                  Tu utilises la dernière version.
                </p>
              </div>

              <div className="px-4 pb-4">
                <button
                  type="button"
                  onClick={poll}
                  disabled={checking}
                  className="w-full h-10 rounded-full text-[13px] font-bold transition-opacity hover:opacity-90 inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait"
                  style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)", color: "var(--ds-text)" }}
                >
                  {checking ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <RefreshCw size={12} strokeWidth={2.4} />
                  )}
                  {checking ? "Vérification…" : "Rechercher une mise à jour"}
                </button>
              </div>
            </>
          )}

          <style>{`
            .update-pop { animation: update-in 180ms cubic-bezier(0.22, 1, 0.36, 1); transform-origin: top right; }
            @keyframes update-in {
              from { opacity: 0; transform: scale(0.96) translateY(-6px); }
              to   { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
        </div>
      )}

      {/* Progress popover during download */}
      {isBusy && (
        <div
          className="ds-glass absolute z-50 right-0 top-[calc(100%+12px)] w-[300px] rounded-[18px] border px-5 py-4 update-pop"
          style={{ borderColor: "var(--ds-border-strong)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-bold">
              {progress.kind === "downloading"
                ? "Téléchargement"
                : progress.kind === "installing"
                  ? "Installation"
                  : "Vérification"}
            </p>
            {pct !== null && (
              <p className="text-[12px] font-mono-num font-bold" style={{ color: "var(--ds-status-ok)" }}>
                {pct}%
              </p>
            )}
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--ds-panel-2)" }}>
            <div
              className="h-full transition-[width] duration-200"
              style={{
                width: pct !== null ? `${pct}%` : "40%",
                background: "var(--ds-status-ok)",
                animation: pct === null ? "update-indeterm 1.4s ease-in-out infinite" : undefined,
              }}
            />
          </div>
          <p className="text-[11px] mt-2.5" style={{ color: "var(--ds-text-dim)" }}>
            {progress.kind === "installing"
              ? "L'app va redémarrer dans un instant."
              : "Garde l'app ouverte pendant le téléchargement."}
          </p>
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
