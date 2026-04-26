import { useEffect, useState, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthContext } from "@/api/auth";
import { apiGet } from "@/api/client";
import type { DiscordUser } from "@/api/types";
import { Status } from "@/routes/Status";
import { Index } from "@/routes/Index";
import { Wiki } from "@/routes/Wiki";
import { Terms } from "@/routes/Terms";
import { Privacy } from "@/routes/Privacy";
import { Dashboard } from "@/routes/Dashboard";
import { Premium } from "@/routes/Premium";
import { ShardServer } from "@/routes/shard/Server";
import { ShardGuild } from "@/routes/shard/Guild";
import { ShardGuardServer } from "@/routes/shardguard/Server";
import { ShardGuardGuild } from "@/routes/shardguard/Guild";
import { AdminLogin } from "@/routes/admin/Login";
import { Admin } from "@/routes/admin/Admin";

export function App() {
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
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/status" element={<Status />} />
          <Route path="/wiki" element={<Wiki />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/premium" element={<Premium />} />
          <Route path="/shard/server" element={<ShardServer />} />
          <Route path="/shard/guild/:guildId" element={<ShardGuild />} />
          <Route path="/shardguard/server" element={<ShardGuardServer />} />
          <Route path="/shardguard/guild/:guildId" element={<ShardGuardGuild />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
