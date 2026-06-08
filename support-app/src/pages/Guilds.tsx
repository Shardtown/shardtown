import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { get } from "@/api/client";
import type { Guild } from "@/types";
import { useMe } from "@/App";
import { Spinner, Empty, guildIcon } from "@/components/Ui";
import { ChevronRight, LifeBuoy } from "lucide-react";

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
    <div className="relative min-h-screen">
      {/* Aurora */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute inset-0 bg-[#07080f]" />
        <div className="absolute inset-x-0 top-0 h-[70vh] [background:radial-gradient(ellipse_90%_70%_at_50%_0%,rgba(91,109,255,0.28)_0%,rgba(139,92,246,0.14)_40%,transparent_70%)]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#07080f]/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <LifeBuoy className="w-3.5 h-3.5 text-indigo-300" strokeWidth={1.8} />
            </div>
            <span className="text-[13px] font-bold text-white tracking-tight">SHARDTOWN <span className="text-white/40 font-medium">Support</span></span>
          </div>
          {me && (
            <div className="flex items-center gap-2.5">
              <img
                src={me.avatar || `https://cdn.discordapp.com/embed/avatars/0.png`}
                alt={me.username}
                className="w-7 h-7 rounded-full border border-white/10"
              />
              <span className="text-[12px] font-medium text-white/50 hidden sm:block">{me.username}</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-black text-white mb-1">Vos serveurs</h1>
        <p className="text-sm text-white/40 mb-10">Sélectionnez un serveur pour accéder au dashboard de support.</p>

        {loading ? (
          <Spinner />
        ) : !guilds || guilds.length === 0 ? (
          <Empty message="Aucun serveur accessible. Vous devez avoir les permissions Gérer le serveur." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {guilds.map(g => (
              <button
                key={g.id}
                type="button"
                onClick={() => navigate(`/guild/${g.id}/stats`)}
                className="group flex items-center gap-3.5 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12] transition-all text-left"
              >
                <img
                  src={guildIcon(g.id, g.icon)}
                  alt={g.name}
                  className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
                  onError={e => { (e.target as HTMLImageElement).src = `https://cdn.discordapp.com/embed/avatars/0.png`; }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-white truncate">{g.name}</p>
                  <p className="text-[11px] text-white/30 mt-0.5 font-mono">{g.id}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0" strokeWidth={2} />
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
