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
import "./unauth.css";

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
      <div className="pala-loading" style={{ minHeight: "100vh" }}>
        <p>Chargement...</p>
      </div>
    );
  }

  if (status === "unauth") {
    return (
      <div className="page-unauth">
        <div className="unauth-content pala-item">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 60.796 63.39"
            className="unauth-logo"
          >
            <path d="M60.3 14.015c-.948 2.943-3.342 5.287-6.184 7.431-2.943 2.244-8.828 3.84-12.319 3.89h-7.334V11.321H41.5a7 7 0 0 1 6.977 6.979v.3a8.3 8.3 0 0 1-.549 2.494 16.36 16.36 0 0 0 8.279-5.436c1.8-2.494 2.544-6.434.449-8.977a18.3 18.3 0 0 0-5.186-4.187A20 20 0 0 0 41.645 0H0l15.162 6.583L18 7.83l4.289 1.9v35.356a19.53 19.53 0 0 1 7.232-7.83 11.8 11.8 0 0 1 5.785-1.546c1.746-.05 3.441 0 5.187 0h1.047a19.93 19.93 0 0 0 13.266-4.888A17 17 0 0 0 60.8 18.054v-.2a19.8 19.8 0 0 0-.5-3.84m-38.056 39.85v9.526l9.725-22.343.948-2.095c-4.987 1.5-9.177 7.331-10.673 14.912" />
          </svg>
          <h3 className="pala-item-title-subtitle">Accès restreint</h3>
          <h1 className="unauth-title pala-item-title-title">SHARDTOWN Support</h1>
          <p className="pala-item-subtitle-text unauth-desc">
            Connectez-vous via le dashboard SHARDTOWN pour accéder au panel de support.
          </p>
          <a
            href={`https://shardtwn.fr/shard/login?returnTo=${encodeURIComponent(window.location.href)}`}
            className="pala-item-button primary large unauth-btn"
          >
            <span className="pala-item-button-content">
              <p>Se connecter</p>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10.182 16.121">
                <path fill="none" stroke="#fff" strokeWidth="3" d="m1.061 1.061 7 7-7 7" />
              </svg>
            </span>
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
