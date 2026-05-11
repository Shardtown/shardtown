import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutGrid, Sparkles, Settings, HelpCircle,
  Search, Bell, User, LogOut, X,
} from "lucide-react";
import { useAuth, avatarUrl } from "@/api/auth";
import { tokenClear, biometricConfirm, openExternal, IS_DESKTOP } from "@/lib/desktop";
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

  const items: NavSpec[] = [
    { to: "/outils",            icon: <LayoutGrid size={18} strokeWidth={1.8} />,                       label: "Tableau de bord" },
    { to: "/shardguard/server", icon: <BotAvatar src="/image/shardguard.png" size={22} alt="ShardGuard" />, label: "ShardGuard" },
    { to: "/shard/server",      icon: <BotAvatar src="/image/shard.png"      size={22} alt="Shard" />,     label: "Shard" },
    { to: "/rpc",               icon: <Sparkles   size={18} strokeWidth={1.8} />,                       label: "Discord RPC" },
    { to: "/preferences",       icon: <Settings   size={18} strokeWidth={1.8} />,                       label: "Préférences" },
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
          className="w-10 h-10 rounded-[12px] overflow-hidden flex items-center justify-center mb-6 transition-opacity hover:opacity-90"
          style={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)" }}
        >
          <img src="/image/favicon.png" alt="Shardtown" className="w-7 h-7 object-contain" />
        </Link>

        <nav className="flex flex-col gap-1.5">
          {items.map(item => (
            <RailItem
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              active={isActive(item.to)}
            />
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
                user={displayName}
                onClose={() => setProfileOpen(false)}
                onLogout={logout}
                onAccount={() => { setProfileOpen(false); nav("/account"); }}
              />
            )}
          </div>
        </header>

        {/* Main content area — scrolls, max-width centered for readability */}
        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-[960px] mx-auto px-8 pt-8 pb-16">{children}</div>
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
  user, onClose, onLogout, onAccount,
}: {
  user: string;
  onClose: () => void;
  onLogout: () => void;
  onAccount: () => void;
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
      className="absolute z-50 right-0 top-[calc(100%+8px)] w-[220px] rounded-[14px] border overflow-hidden profile-pop"
      style={{
        background: "var(--ds-bg-1)",
        borderColor: "var(--ds-border-strong)",
        boxShadow: "0 20px 50px -10px rgba(0,0,0,0.45)",
      }}
    >
      <div className="px-3 py-2.5 border-b" style={{ borderColor: "var(--ds-border)" }}>
        <p className="text-[12px]" style={{ color: "var(--ds-text-dim)" }}>Connecté en tant que</p>
        <p className="text-[13px] font-semibold truncate">{user}</p>
      </div>
      <button
        type="button"
        onClick={onAccount}
        className="w-full text-left px-3 py-2.5 text-[13px] transition-colors hover:bg-[var(--ds-panel)] flex items-center gap-2"
        style={{ color: "var(--ds-text)" }}
      >
        <User size={13} strokeWidth={2} style={{ color: "var(--ds-text-mut)" }} />
        Mon compte
      </button>
      <button
        type="button"
        onClick={onLogout}
        className="w-full text-left px-3 py-2.5 text-[13px] transition-colors hover:bg-[var(--ds-panel)] flex items-center gap-2 border-t"
        style={{ color: "var(--ds-text)", borderColor: "var(--ds-border)" }}
      >
        <LogOut size={13} strokeWidth={2} style={{ color: "var(--ds-text-mut)" }} />
        Déconnexion
      </button>
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
      { label: "Discord RPC",            hint: "Rich Presence",          path: "/rpc" },
      { label: "Préférences",            hint: "Sons, Touch ID, thème",  path: "/preferences" },
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
