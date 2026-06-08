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
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 text-center px-4 bg-[#07080f]">
        <div className="fixed inset-0 pointer-events-none [background:radial-gradient(ellipse_90%_60%_at_50%_0%,rgba(91,109,255,0.22)_0%,transparent_70%)]" />
        <div className="relative z-10 flex flex-col items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Accès restreint</h1>
            <p className="text-sm text-white/40 mt-1.5 max-w-xs leading-relaxed">
              Connectez-vous via le dashboard SHARDTOWN pour accéder au panel de support.
            </p>
          </div>
          <a
            href={`https://shardtwn.fr/shard/login?returnTo=${encodeURIComponent(window.location.href)}`}
            className="px-6 py-2.5 rounded-full bg-white text-black text-sm font-bold hover:opacity-90 transition-opacity"
          >
            Se connecter
          </a>
        </div>
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
