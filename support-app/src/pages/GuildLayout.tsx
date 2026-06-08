import { useState, useEffect } from "react";
import { Outlet, NavLink, useParams, useNavigate } from "react-router-dom";
import { get } from "@/api/client";
import type { Guild } from "@/types";
import { useMe } from "@/App";
import { guildIcon, Spinner } from "@/components/Ui";
import { BarChart2, Ticket, FileText, Settings, AlertTriangle, ArrowLeft } from "lucide-react";
import { createContext, useContext } from "react";

const NAV = [
  { to: "stats",       label: "Aperçu",        icon: BarChart2 },
  { to: "tickets",     label: "Tickets",        icon: Ticket },
  { to: "transcripts", label: "Transcripts",    icon: FileText },
  { to: "config",      label: "Configuration",  icon: Settings },
  { to: "incidents",   label: "Incidents",      icon: AlertTriangle },
];

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

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
    </div>
  );
  if (!guild) return null;

  return (
    <Ctx.Provider value={guild}>
      {/* Aurora background */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute inset-0 bg-[#07080f]" />
        <div className="absolute inset-x-0 top-0 h-[70vh] [background:radial-gradient(ellipse_90%_70%_at_50%_0%,rgba(91,109,255,0.28)_0%,rgba(139,92,246,0.14)_40%,transparent_70%)]" />
      </div>

      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="w-[220px] flex-shrink-0 flex flex-col p-3 gap-3 sticky top-0 h-screen">
          {/* Back button */}
          <button
            type="button"
            onClick={() => navigate("/guilds")}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium text-white/40 hover:text-white/70 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
            Tous les serveurs
          </button>

          {/* Guild info */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <img
              src={guildIcon(guild.id, guild.icon)}
              alt={guild.name}
              className="w-8 h-8 rounded-xl object-cover flex-shrink-0"
              onError={e => { (e.target as HTMLImageElement).src = `https://cdn.discordapp.com/embed/avatars/0.png`; }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-white truncate">{guild.name}</p>
              <p className="text-[10px] text-white/30 mt-0.5">Support</p>
            </div>
          </div>

          {/* Nav */}
          <div className="flex-1 rounded-2xl border border-white/[0.06] bg-white/[0.015] backdrop-blur-sm p-2 flex flex-col gap-0.5">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                    isActive ? "text-white" : "text-white/55 hover:text-white"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-white" />
                    )}
                    <Icon className="w-[16px] h-[16px] flex-shrink-0" strokeWidth={1.8} />
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </div>

          {/* User */}
          {me && (
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.015]">
              <img
                src={me.avatar || `https://cdn.discordapp.com/embed/avatars/0.png`}
                alt={me.username}
                className="w-6 h-6 rounded-full flex-shrink-0"
              />
              <p className="text-[12px] font-medium text-white/60 truncate">{me.username}</p>
            </div>
          )}
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-8 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </Ctx.Provider>
  );
}
