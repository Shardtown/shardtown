import { useState, useEffect, createContext, useContext } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { get, ApiError } from "@/api/client";
import type { Me } from "@/types";
import Guilds from "@/pages/Guilds";
import GuildLayout from "@/pages/GuildLayout";
import Stats from "@/pages/tabs/Stats";
import Tickets from "@/pages/tabs/Tickets";
import Transcripts from "@/pages/tabs/Transcripts";
import Config from "@/pages/tabs/Config";
import Incidents from "@/pages/tabs/Incidents";

const MeCtx = createContext<Me | null>(null);
export const useMe = () => useContext(MeCtx);

export default function App() {
  const [me, setMe]       = useState<Me | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "unauth">("loading");

  useEffect(() => {
    get<Me>("/api/support/me")
      .then(u => { setMe(u); setStatus("ok"); })
      .catch(e => {
        if (e instanceof ApiError && e.status === 401) setStatus("unauth");
        else setStatus("unauth");
      });
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
      </div>
    );
  }

  if (status === "unauth") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="text-4xl mb-2">🔒</div>
        <h1 className="text-xl font-bold text-white">Accès restreint</h1>
        <p className="text-sm text-white/50 max-w-xs">
          Connectez-vous d'abord au dashboard principal pour accéder au support.
        </p>
        <a
          href="https://shardtwn.fr/shard/login"
          className="mt-2 px-6 py-2.5 rounded-full bg-white text-black font-bold text-sm hover:opacity-90 transition-opacity"
        >
          Se connecter
        </a>
      </div>
    );
  }

  return (
    <MeCtx.Provider value={me}>
      <BrowserRouter>
        <Routes>
          <Route path="/"        element={<Navigate to="/guilds" replace />} />
          <Route path="/guilds"  element={<Guilds />} />
          <Route path="/guild/:guildId" element={<GuildLayout />}>
            <Route index            element={<Navigate to="stats" replace />} />
            <Route path="stats"       element={<Stats />} />
            <Route path="tickets"     element={<Tickets />} />
            <Route path="transcripts" element={<Transcripts />} />
            <Route path="config"      element={<Config />} />
            <Route path="incidents"   element={<Incidents />} />
          </Route>
          <Route path="*" element={<Navigate to="/guilds" replace />} />
        </Routes>
      </BrowserRouter>
    </MeCtx.Provider>
  );
}
