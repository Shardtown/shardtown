import { useState, useEffect } from "react";
import { Outlet, NavLink, useParams, useNavigate } from "react-router-dom";
import { get } from "@/api/client";
import type { Guild } from "@/types";
import { useMe } from "@/App";
import { guildIcon, Spinner } from "@/components/Ui";
import {
  BarChart2, Ticket, FileText, Settings, AlertTriangle, ChevronLeft,
} from "lucide-react";

const NAV = [
  { to: "stats",       label: "Aperçu",        icon: BarChart2 },
  { to: "tickets",     label: "Tickets",        icon: Ticket },
  { to: "transcripts", label: "Transcripts",    icon: FileText },
  { to: "config",      label: "Configuration",  icon: Settings },
  { to: "incidents",   label: "Incidents",      icon: AlertTriangle },
];

export const GuildCtx = { guild: null as Guild | null };

import { createContext, useContext } from "react";
const Ctx = createContext<Guild | null>(null);
export const useGuild = () => useContext(Ctx);

export default function GuildLayout() {
  const { guildId } = useParams<{ guildId: string }>();
  const navigate = useNavigate();
  const me = useMe();
  const [guild, setGuild] = useState<Guild | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get<Guild[]>("/api/support/guilds")
      .then(list => {
        const g = list.find(g => g.id === guildId);
        if (!g) navigate("/guilds");
        else setGuild(g);
      })
      .catch(() => navigate("/guilds"))
      .finally(() => setLoading(false));
  }, [guildId, navigate]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>;
  if (!guild) return null;

  return (
    <Ctx.Provider value={guild}>
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="w-60 flex-shrink-0 border-r border-white/[0.06] flex flex-col bg-black/20">
          {/* Top: back + branding */}
          <div className="p-4 border-b border-white/[0.06]">
            <button
              type="button"
              onClick={() => navigate("/guilds")}
              className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors mb-4"
            >
              <ChevronLeft size={13} /> Tous les serveurs
            </button>
            <div className="flex items-center gap-3">
              <img
                src={guildIcon(guild.id, guild.icon)}
                alt={guild.name}
                className="w-9 h-9 rounded-xl object-cover"
                onError={e => { (e.target as HTMLImageElement).src = `https://cdn.discordapp.com/embed/avatars/0.png`; }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{guild.name}</p>
                <p className="text-[10px] text-white/30">Support Dashboard</p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-3 space-y-0.5">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-white/[0.08] text-white"
                      : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
                  }`
                }
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Bottom: user */}
          {me && (
            <div className="p-4 border-t border-white/[0.06] flex items-center gap-2.5">
              <img
                src={me.avatar || `https://cdn.discordapp.com/embed/avatars/0.png`}
                alt={me.username}
                className="w-7 h-7 rounded-full"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-white/70 truncate">{me.username}</p>
              </div>
            </div>
          )}
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-8 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </Ctx.Provider>
  );
}
