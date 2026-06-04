import { useEffect, useState, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthContext } from "@/api/auth";
import { AccountContext, type Account as AccountData } from "@/api/account";
import { apiGet } from "@/api/client";
import type { DiscordUser } from "@/api/types";
import { IS_DESKTOP } from "@/lib/desktop";
import { DesktopGate } from "@/components/DesktopGate";
import { TourHost } from "@/components/OnboardingTour";
import { PostUpdateNotes } from "@/components/PostUpdateNotes";
import { VerifyAllNotifier } from "@/components/VerifyAllNotifier";
import { BotStateMonitor } from "@/components/BotStateMonitor";
import { ServerActivityMonitor } from "@/components/ServerActivityMonitor";
import { DeepLinkHandler } from "@/components/DeepLinkHandler";
import { Status } from "@/routes/Status";
import { Index } from "@/routes/Index";
import { Wiki } from "@/routes/Wiki";
import { Terms } from "@/routes/Terms";
import { Privacy } from "@/routes/Privacy";
import { Outils } from "@/routes/Outils";
import { DesktopOverview } from "@/routes/desktop/Overview";
import { DesktopRpc } from "@/routes/desktop/Rpc";
import { DesktopPreferences } from "@/routes/desktop/Preferences";
import { DesktopStatus } from "@/routes/desktop/Status";
import { DesktopAccount } from "@/routes/desktop/Account";
import { DesktopPremium } from "@/routes/desktop/Premium";
import { DesktopBotServer } from "@/routes/desktop/BotServer";
import { TrayPanel } from "@/routes/desktop/TrayPanel";
import { Premium } from "@/routes/Premium";
import { Produits } from "@/routes/Produits";
import { ShardServer } from "@/routes/shard/Server";
import { ShardGuild } from "@/routes/shard/Guild";
import { AdminLogin } from "@/routes/admin/Login";
import { Admin } from "@/routes/admin/Admin";
import { AdminGuildDetail } from "@/routes/admin/GuildDetail";
import { Assistant } from "@/routes/Assistant";
import { AccountLogin } from "@/routes/account/Login";
import { VerifyEmail } from "@/routes/account/VerifyEmail";
import { Account } from "@/routes/account/Account";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GooeyFilter } from "@/components/ui/toggle";

// Marketing / informational routes that don't make sense inside the
// desktop app, they redirect to the tools hub when running in Tauri.
const HOME_ROUTE = IS_DESKTOP ? "/outils" : "/";

// Tauri opens a secondary window with ?panel=tray for the menu-bar
// popover. That window mounts the same SPA but should render only the
// compact TrayPanel, no router, no shell, no main dashboard.
const IS_TRAY_PANEL = typeof window !== "undefined"
  && new URLSearchParams(window.location.search).get("panel") === "tray";

export function App() {
  // Hooks must run unconditionally, split the tray-panel branch into a
  // separate component so its hook list never coexists with App's.
  if (IS_TRAY_PANEL) return <TrayPanel />;
  return <AppMain />;
}

function AppMain() {
  const [user, setUser] = useState<DiscordUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<{ user: DiscordUser | null }>("/api/me");
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAccount = useCallback(async () => {
    try {
      const data = await apiGet<{ account: AccountData | null }>("/api/account/me");
      setAccount(data.account);
    } catch {
      setAccount(null);
    } finally {
      setAccountLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); refreshAccount(); }, [refresh, refreshAccount]);

  return (
    <AccountContext.Provider value={{ account, loading: accountLoading, refresh: refreshAccount }}>
    <AuthContext.Provider value={{ user, loading, refresh }}>
      <DesktopGate>
        <GooeyFilter />
        <BrowserRouter>
          <ErrorBoundary>
            {/* Tauri drag handle, invisible strip on top of the window */}
            {IS_DESKTOP && <div className="fixed inset-x-0 top-0 h-7 z-50 pointer-events-none" data-tauri-drag-region />}
            <Routes>
              {IS_DESKTOP ? (
                <>
                  {/* Desktop: tool hub is the entry, marketing routes redirect */}
                  <Route path="/" element={<Navigate to="/outils" replace />} />
                  <Route path="/wiki" element={<Navigate to="/outils" replace />} />
                  <Route path="/terms" element={<Navigate to="/outils" replace />} />
                  <Route path="/privacy" element={<Navigate to="/outils" replace />} />
                  <Route path="/produits" element={<Navigate to="/outils" replace />} />
                  <Route path="/status" element={<Navigate to="/statut" replace />} />
                  <Route path="/statut" element={<DesktopStatus />} />
                  <Route path="/premium" element={<DesktopPremium />} />
                  <Route path="/assistant" element={<Assistant />} />
                </>
              ) : (
                <>
                  <Route path="/" element={<Index />} />
                  <Route path="/status" element={<Status />} />
                  <Route path="/wiki" element={<Wiki />} />
                  <Route path="/download" element={<Navigate to="/#download" replace />} />
                  <Route path="/assistant" element={<Assistant />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/premium" element={<Premium />} />
                  <Route path="/produits" element={<Produits />} />
                </>
              )}
              <Route path="/outils" element={IS_DESKTOP ? <DesktopOverview /> : <Outils />} />
              {IS_DESKTOP && <Route path="/rpc" element={<DesktopRpc />} />}
              {IS_DESKTOP && <Route path="/preferences" element={<DesktopPreferences />} />}
              {/* Ancien chemin, redirige vers /outils pour ne rien casser */}
              <Route path="/dashboard" element={<Navigate to="/outils" replace />} />
              <Route path="/shard/server" element={IS_DESKTOP ? <DesktopBotServer /> : <ShardServer />} />
              <Route path="/shard/guild/:guildId" element={<ShardGuild />} />
              {!IS_DESKTOP && <Route path="/admin/login" element={<AdminLogin />} />}
              {!IS_DESKTOP && <Route path="/admin" element={<Admin />} />}
              {!IS_DESKTOP && <Route path="/admin/guild/:guildId" element={<AdminGuildDetail />} />}
              <Route path="/account/signup" element={<Navigate to="/account/login?mode=register" replace />} />
              <Route path="/account/login" element={<AccountLogin />} />
              <Route path="/account/verify" element={<VerifyEmail />} />
              <Route path="/account" element={IS_DESKTOP ? <DesktopAccount /> : <Account />} />
              <Route path="*" element={<Navigate to={HOME_ROUTE} replace />} />
            </Routes>
            {/* Persistent overlays that must survive route changes. AppLayout
                (and therefore DesktopShell) is *inside* each route, so they
                remount on every navigation, the tour modal, post-update
                notes etc. would lose their state. Mount them once here, at
                the Routes sibling level, so they stay alive throughout. */}
            {IS_DESKTOP && <PersistentOverlays />}
          </ErrorBoundary>
        </BrowserRouter>
      </DesktopGate>
    </AuthContext.Provider>
    </AccountContext.Provider>
  );
}

function PersistentOverlays() {
  return (
    <>
      <TourHost />
      <PostUpdateNotes />
      <VerifyAllNotifier />
      <BotStateMonitor />
      <ServerActivityMonitor />
      <DeepLinkHandler />
    </>
  );
}
