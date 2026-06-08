import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { get } from "@/api/client";
import type { Guild } from "@/types";
import { useMe } from "@/App";
import { Spinner, Empty, guildIcon } from "@/components/Ui";

export default function Guilds() {
  const me = useMe();
  const navigate = useNavigate();
  const [guilds, setGuilds] = useState<Guild[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get<Guild[]>("/api/support/guilds")
      .then(setGuilds)
      .catch(() => setGuilds([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-xs font-black">S</div>
          <span className="text-sm font-bold text-white">SHARDTOWN Support</span>
        </div>
        {me && (
          <div className="flex items-center gap-2.5">
            <img
              src={me.avatar || `https://cdn.discordapp.com/embed/avatars/0.png`}
              alt={me.username}
              className="w-7 h-7 rounded-full"
            />
            <span className="text-xs font-medium text-white/60">{me.username}</span>
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-black text-white mb-1">Vos serveurs</h1>
        <p className="text-sm text-white/40 mb-8">Sélectionnez un serveur pour accéder au dashboard de support.</p>

        {loading ? (
          <Spinner />
        ) : !guilds || guilds.length === 0 ? (
          <Empty message="Aucun serveur accessible. Vous devez avoir les permissions Gérer le serveur." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {guilds.map(g => (
              <button
                key={g.id}
                type="button"
                onClick={() => navigate(`/guild/${g.id}/stats`)}
                className="flex items-center gap-3 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.05] hover:border-white/[0.12] transition-all text-left group"
              >
                <img
                  src={guildIcon(g.id, g.icon)}
                  alt={g.name}
                  className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
                  onError={e => { (e.target as HTMLImageElement).src = `https://cdn.discordapp.com/embed/avatars/0.png`; }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate group-hover:text-white/90">{g.name}</p>
                  <p className="text-[11px] text-white/30 mt-0.5">ID: {g.id}</p>
                </div>
                <svg className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
