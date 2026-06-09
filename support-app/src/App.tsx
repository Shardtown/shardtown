import { useState, useEffect, createContext, useContext } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { get, ApiError } from "@/api/client";
import type { Me } from "@/types";
import Guilds from "@/pages/Guilds";
import GuildLayout from "@/pages/GuildLayout";
import Stats from "@/pages/tabs/Stats";
import Tickets from "@/pages/tabs/Tickets";
import Transcripts from "@/pages/tabs/Transcripts";
import Transcript from "@/pages/tabs/Transcript";
import Config from "@/pages/tabs/Config";
import Incidents from "@/pages/tabs/Incidents";

const MeCtx = createContext<Me | null>(null);
export const useMe = () => useContext(MeCtx);

const ShardLogo = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60.796 63.39" className="w-16 h-16" style={{ fill: 'white' }}>
    <path d="M60.3 14.015c-.948 2.943-3.342 5.287-6.184 7.431-2.943 2.244-8.828 3.84-12.319 3.89h-7.334V11.321H41.5a7 7 0 0 1 6.977 6.979v.3a8.3 8.3 0 0 1-.549 2.494 16.36 16.36 0 0 0 8.279-5.436c1.8-2.494 2.544-6.434.449-8.977a18.3 18.3 0 0 0-5.186-4.187A20 20 0 0 0 41.645 0H0l15.162 6.583L18 7.83l4.289 1.9v35.356a19.53 19.53 0 0 1 7.232-7.83 11.8 11.8 0 0 1 5.785-1.546c1.746-.05 3.441 0 5.187 0h1.047a19.93 19.93 0 0 0 13.266-4.888A17 17 0 0 0 60.8 18.054v-.2a19.8 19.8 0 0 0-.5-3.84m-38.056 39.85v9.526l9.725-22.343.948-2.095c-4.987 1.5-9.177 7.331-10.673 14.912" />
  </svg>
);

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <ShardLogo />
          <div className="flex gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }

  if (status === "unauth") {
    return (
      <div className="flex items-center justify-center min-h-screen overflow-hidden">
        {/* Base sombre */}
        <div className="fixed inset-0 -z-20 bg-[#0a0a0a]" />
        {/* Aurora */}
        <div className="fixed inset-0 pointer-events-none -z-10">
          <div className="absolute inset-x-0 top-0 h-[100vh] [background:radial-gradient(ellipse_80%_80%_at_50%_0%,rgba(59,130,246,0.25)_0%,rgba(29,78,216,0.12)_40%,transparent_100%)]" />
        </div>
        <div className="flex flex-col items-center gap-8 px-6 text-center max-w-md">
          <div className="p-5 rounded-3xl bg-white/[0.04] border border-white/[0.08] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
            <ShardLogo />
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold tracking-[0.25em] uppercase text-white/40">Accès restreint</p>
            <h1 className="text-4xl font-extrabold tracking-tight uppercase leading-tight">
              SHARDTOWN<br /><span className="text-white/50 text-2xl">Support</span>
            </h1>
            <p className="text-white/55 text-base leading-relaxed">
              Connectez-vous via le dashboard SHARDTOWN pour accéder au panel de support.
            </p>
          </div>
          <a
            href={`https://shardtwn.fr/shard/login?returnTo=${encodeURIComponent(window.location.href)}`}
            className="btn-liquid btn-liquid--primary inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm"
          >
            Se connecter
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 16" width="8" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="m1 1 7 7-7 7" />
            </svg>
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
            <Route index                 element={<Navigate to="tickets" replace />} />
            <Route path="stats"          element={<Stats />} />
            <Route path="tickets"        element={<Tickets />} />
            <Route path="transcripts"    element={<Transcripts />} />
            <Route path="transcript/:id" element={<Transcript />} />
            <Route path="config"         element={<Config />} />
            <Route path="incidents"      element={<Incidents />} />
          </Route>
          <Route path="*" element={<Navigate to="/guilds" replace />} />
        </Routes>
      </BrowserRouter>
    </MeCtx.Provider>
  );
}
