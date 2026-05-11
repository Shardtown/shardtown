import { useEffect, useState, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthContext } from "@/api/auth";
import { apiGet } from "@/api/client";
import type { DiscordUser } from "@/api/types";
import { IS_DESKTOP } from "@/lib/desktop";
import { DesktopGate } from "@/components/DesktopGate";
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
import { DesktopBotServer } from "@/routes/desktop/BotServer";
import { TrayPanel } from "@/routes/desktop/TrayPanel";
import { Premium } from "@/routes/Premium";
import { ShardServer } from "@/routes/shard/Server";
import { ShardGuild } from "@/routes/shard/Guild";
import { ShardGuardServer } from "@/routes/shardguard/Server";
import { ShardGuardGuild } from "@/routes/shardguard/Guild";
import { AdminLogin } from "@/routes/admin/Login";
import { Admin } from "@/routes/admin/Admin";
import { AdminGuildDetail } from "@/routes/admin/GuildDetail";
import { Assistant } from "@/routes/Assistant";
import { AccountLogin } from "@/routes/account/Login";
import { VerifyEmail } from "@/routes/account/VerifyEmail";
import { Account } from "@/routes/account/Account";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Marketing / informational routes that don't make sense inside the
// desktop app — they redirect to the tools hub when running in Tauri.
const HOME_ROUTE = IS_DESKTOP ? "/outils" : "/";

// Tauri opens a secondary window with ?panel=tray for the menu-bar
// popover. That window mounts the same SPA but should render only the
// compact TrayPanel — no router, no shell, no main dashboard.
const IS_TRAY_PANEL = typeof window !== "undefined"
  && new URLSearchParams(window.location.search).get("panel") === "tray";

export function App() {
  if (IS_TRAY_PANEL) return <TrayPanel />;
  const [user, setUser] = useState<DiscordUser | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh }}>
      <DesktopGate>
        <BrowserRouter>
          <ErrorBoundary>
            {/* Tauri drag handle — invisible strip on top of the window */}
            {IS_DESKTOP && <div className="fixed inset-x-0 top-0 h-7 z-50 pointer-events-none" data-tauri-drag-region />}
            <Routes>
              {IS_DESKTOP ? (
                <>
                  {/* Desktop: tool hub is the entry, marketing routes redirect */}
                  <Route path="/" element={<Navigate to="/outils" replace />} />
                  <Route path="/wiki" element={<Navigate to="/outils" replace />} />
                  <Route path="/premium" element={<Navigate to="/outils" replace />} />
                  <Route path="/terms" element={<Navigate to="/outils" replace />} />
                  <Route path="/privacy" element={<Navigate to="/outils" replace />} />
                  <Route path="/status" element={<Navigate to="/statut" replace />} />
                  <Route path="/statut" element={<DesktopStatus />} />
                  <Route path="/assistant" element={<Assistant />} />
                </>
              ) : (
                <>
                  <Route path="/" element={<Index />} />
                  <Route path="/status" element={<Status />} />
                  <Route path="/wiki" element={<Wiki />} />
                  <Route path="/assistant" element={<Assistant />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/premium" element={<Premium />} />
                </>
              )}
              <Route path="/outils" element={IS_DESKTOP ? <DesktopOverview /> : <Outils />} />
              {IS_DESKTOP && <Route path="/rpc" element={<DesktopRpc />} />}
              {IS_DESKTOP && <Route path="/preferences" element={<DesktopPreferences />} />}
              {/* Ancien chemin — redirige vers /outils pour ne rien casser */}
              <Route path="/dashboard" element={<Navigate to="/outils" replace />} />
              <Route path="/shard/server" element={IS_DESKTOP ? <DesktopBotServer kind="shard" /> : <ShardServer />} />
              <Route path="/shard/guild/:guildId" element={<ShardGuild />} />
              <Route path="/shardguard/server" element={IS_DESKTOP ? <DesktopBotServer kind="shardguard" /> : <ShardGuardServer />} />
              <Route path="/shardguard/guild/:guildId" element={<ShardGuardGuild />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/guild/:guildId" element={<AdminGuildDetail />} />
              <Route path="/account/signup" element={<Navigate to="/account/login?mode=register" replace />} />
              <Route path="/account/login" element={<AccountLogin />} />
              <Route path="/account/verify" element={<VerifyEmail />} />
              <Route path="/account" element={<Account />} />
              <Route path="*" element={<Navigate to={HOME_ROUTE} replace />} />
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </DesktopGate>
    </AuthContext.Provider>
  );
}
