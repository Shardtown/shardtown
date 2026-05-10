import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutGrid, Shield, Zap, User, LogOut, Sparkles, Settings, Sun, Moon,
} from "lucide-react";
import { useAuth, avatarUrl } from "@/api/auth";
import { tokenClear, biometricConfirm, IS_DESKTOP } from "@/lib/desktop";
import { setBearerToken, apiPost } from "@/api/client";
import { getStoredTheme, setTheme, type Theme } from "@/lib/theme";

/**
 * The desktop app's chrome — sidebar + main content area + bottom status
 * strip. Replaces the website's Header/Footer in Tauri mode. Keeps the
 * window-drag region pinned at the top so the chromeless macOS window
 * remains draggable from anywhere on the toolbar strip.
 */
export function DesktopShell({ children }: { children: ReactNode }) {
  const { user, refresh } = useAuth();
  const location = useLocation();
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  const displayName = user?.global_name || user?.username || "Compte";

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setThemeState(next);
    setTheme(next);
  }

  function isActive(prefix: string) {
    return location.pathname === prefix || location.pathname.startsWith(prefix + "/");
  }

  async function logout() {
    // Touch ID gate on the desktop — destructive enough that we don't
    // want a stray click to lock the user out.
    if (IS_DESKTOP) {
      const ok = await biometricConfirm("Confirme avec Touch ID pour te déconnecter");
      if (!ok) return;
    }
    // Web logout endpoint clears the server session; for desktop we also
    // wipe the local Keychain so the next launch shows the PAT screen.
    await apiPost("/api/account/logout").catch(() => {});
    if (IS_DESKTOP) {
      setBearerToken(null);
      await tokenClear().catch(() => {});
    }
    refresh();
    // Hard reload so the DesktopGate runs again and lands on the PAT login.
    window.location.reload();
  }

  return (
    <div
      className="h-screen w-screen flex overflow-hidden"
      style={{ background: "var(--ds-bg)", color: "var(--ds-text)" }}
    >
      {/* Drag region — invisible strip at the top of the window */}
      <div className="fixed inset-x-0 top-0 h-7 z-50 pointer-events-none" data-tauri-drag-region />

      {/* Sidebar */}
      <aside
        className="w-[232px] flex-shrink-0 flex flex-col px-3 pt-9 pb-3 select-none border-r"
        style={{ background: "var(--ds-bg-1)", borderColor: "var(--ds-border)" }}
      >
        <div className="flex items-center gap-2.5 px-2.5 pb-5">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
            title={theme === "dark" ? "Mode clair" : "Mode sombre"}
            className="w-[26px] h-[26px] rounded-md flex items-center justify-center transition-opacity hover:opacity-80"
            style={{ background: "var(--ds-panel-2)", color: "var(--ds-text-mut)", border: "1px solid var(--ds-border)" }}
          >
            {theme === "dark"
              ? <Sun size={12} strokeWidth={2} />
              : <Moon size={12} strokeWidth={2} />}
          </button>
          <img src="/logo.png" alt="" className="w-[22px] h-[22px] rounded-md" />
          <span className="font-extrabold text-[13.5px] tracking-tight">Shardtown</span>
        </div>

        <p className="text-[9.5px] font-bold tracking-[0.22em] uppercase px-3 pt-3 pb-2" style={{ color: "var(--ds-text-faint)" }}>
          Accueil
        </p>
        <nav className="flex flex-col gap-px">
          <NavItem to="/outils" active={isActive("/outils")} icon={<LayoutGrid size={15} strokeWidth={1.8} />} label="Tableau de bord" />
        </nav>

        <p className="text-[9.5px] font-bold tracking-[0.22em] uppercase px-3 pt-4 pb-2" style={{ color: "var(--ds-text-faint)" }}>
          Bots
        </p>
        <nav className="flex flex-col gap-px">
          <NavItem to="/shardguard/server" active={isActive("/shardguard")} icon={<Shield size={15} strokeWidth={1.8} />} label="ShardGuard" />
          <NavItem to="/shard/server" active={isActive("/shard")} icon={<Zap size={15} strokeWidth={1.8} />} label="Shard" />
        </nav>

        <p className="text-[9.5px] font-bold tracking-[0.22em] uppercase px-3 pt-4 pb-2" style={{ color: "var(--ds-text-faint)" }}>
          Discord
        </p>
        <nav className="flex flex-col gap-px">
          <NavItem to="/rpc" active={isActive("/rpc")} icon={<Sparkles size={15} strokeWidth={1.8} />} label="Rich Presence" />
        </nav>

        <p className="text-[9.5px] font-bold tracking-[0.22em] uppercase px-3 pt-4 pb-2" style={{ color: "var(--ds-text-faint)" }}>
          Compte
        </p>
        <nav className="flex flex-col gap-px">
          <NavItem to="/account" active={isActive("/account")} icon={<User size={15} strokeWidth={1.8} />} label="Mon compte" />
          <NavItem to="/preferences" active={isActive("/preferences")} icon={<Settings size={15} strokeWidth={1.8} />} label="Préférences" />
        </nav>

        {/* Sidebar footer — user row + logout */}
        <div className="mt-auto pt-3 px-1 border-t" style={{ borderColor: "var(--ds-border)" }}>
          <div className="flex items-center gap-2.5 p-2 rounded-xl">
            {user
              ? <img src={avatarUrl(user, 64)} alt="" className="w-[30px] h-[30px] rounded-[9px] border" style={{ borderColor: "var(--ds-border)" }} />
              : <div
                  className="w-[30px] h-[30px] rounded-[9px] border flex items-center justify-center text-[11px] font-bold"
                  style={{ background: "var(--ds-panel-2)", borderColor: "var(--ds-border)", color: "var(--ds-text-mut)" }}
                >
                  {displayName[0]?.toUpperCase() || "?"}
                </div>}
            <span className="flex-1 min-w-0 text-[12.5px] font-semibold truncate">{displayName}</span>
            <button
              type="button"
              onClick={logout}
              aria-label="Déconnexion"
              title="Déconnexion"
              className="p-1.5 rounded-lg transition-colors hover:opacity-80"
              style={{ color: "var(--ds-text-faint)" }}
            >
              <LogOut size={13} strokeWidth={2} />
            </button>
          </div>
        </div>
      </aside>

      {/* Right pane — content scrolls, status bar pinned at bottom */}
      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="pt-12 px-12 pb-8">{children}</div>
        </main>
        <StatusBar />
      </div>
    </div>
  );
}

function NavItem({
  to, active, icon, label,
}: {
  to: string;
  active: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className={`nav-item flex items-center gap-[11px] px-3 py-[9px] rounded-[10px] text-[13px] transition-colors ${active ? "nav-item-active" : ""}`}
      style={
        active
          ? { background: "var(--ds-panel-2)", color: "var(--ds-text)", fontWeight: 600 }
          : { color: "var(--ds-text-mut)" }
      }
    >
      {icon}
      {label}
    </Link>
  );
}

function StatusBar() {
  const { user } = useAuth();
  return (
    <div
      className="flex-shrink-0 px-12 py-3 border-t flex items-center gap-3.5 text-[11.5px]"
      style={{ borderColor: "var(--ds-border)", background: "var(--ds-bg-1)", color: "var(--ds-text-dim)" }}
    >
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border"
        style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(74,222,128)]" />
        Connecté
      </span>
      <span>{user?.username || "—"}</span>
      <span style={{ color: "var(--ds-text-faint)" }}>·</span>
      <span>shardtwn.fr</span>
      <span className="ml-auto font-mono text-[10.5px]" style={{ color: "var(--ds-text-faint)" }}>v0.1.1</span>
    </div>
  );
}
