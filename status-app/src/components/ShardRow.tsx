import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search, Server } from "lucide-react";
import type { Shard } from "@/lib/types";
import { Sparkline } from "./Sparkline";

interface Props {
  shard: Shard;
  pingHistory: number[];
  externalQuery?: string;
}

function timeSince(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 10) return "il y a quelques secondes";
  if (s < 60) return `il y a ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m}min`;
  return `il y a ${Math.floor(m / 60)}h`;
}

function getPingClass(p: number) {
  if (!p) return "text-white/30 bg-white/[0.04] border-white/5";
  if (p < 100) return "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
  if (p < 250) return "text-yellow-300 bg-yellow-500/10 border-yellow-500/20";
  return "text-red-300 bg-red-500/10 border-red-500/20";
}

const plural = (n: number, s: string) => (n > 1 ? `${s}s` : s);

export function ShardRow({ shard, pingHistory, externalQuery }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const isOnline = shard.status === "Online";
  const guildsList = useMemo(() => shard.guilds_list || [], [shard.guilds_list]);
  const guilds = shard.guild_count || guildsList.length;

  useEffect(() => {
    if (externalQuery) {
      setOpen(true);
      setQuery(externalQuery);
    }
  }, [externalQuery]);
  const lastUpdateMs = shard.last_update ? new Date(shard.last_update).getTime() : null;
  const timeAgo = lastUpdateMs ? timeSince(lastUpdateMs) : "il y a quelques secondes";
  const sparkColor = !isOnline ? "#ef4444" : shard.ping < 100 ? "#10b981" : shard.ping < 250 ? "#f59e0b" : "#ef4444";
  const expandable = guildsList.length > 0;

  const filteredGuilds = useMemo(() => {
    if (!query.trim()) return guildsList;
    const q = query.toLowerCase();
    return guildsList.filter(
      g =>
        (g.guild_name || "").toLowerCase().includes(q) ||
        g.guild_id.includes(q),
    );
  }, [guildsList, query]);

  return (
    <div className="rounded-xl my-1 transition-colors hover:bg-white/[0.025]">
      <button
        type="button"
        onClick={() => expandable && setOpen(o => !o)}
        disabled={!expandable}
        aria-expanded={open}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left ${
          expandable ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <div
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
            isOnline
              ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
              : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)] animate-pulse"
          }`}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold leading-none">
              Shard <span className="text-white/40 font-mono-num">#{shard.shard_id}</span>
            </span>
            {!isOnline && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-300 uppercase tracking-wider">
                Hors ligne
              </span>
            )}
            {expandable && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-white/50 uppercase tracking-wider inline-flex items-center gap-1">
                <Server className="w-2.5 h-2.5" />
                {guildsList.length} {plural(guildsList.length, "serveur")}
              </span>
            )}
          </div>
          <p className="text-[11px] text-white/35 font-medium mt-1">
            Mis à jour {timeAgo}
            <span className="mx-1 text-white/15">·</span>
            <span className="font-mono-num">{guilds.toLocaleString("fr-FR")}</span>{" "}
            {plural(guilds, "serveur")}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {pingHistory.length > 1 && (
            <div className="hidden sm:block" style={{ width: 56, height: 18 }}>
              <Sparkline values={pingHistory} color={sparkColor} width={56} height={18} showDot={false} />
            </div>
          )}
          <span
            className={`text-[11px] font-bold font-mono-num px-2 py-1 rounded-lg border ${getPingClass(
              shard.ping,
            )}`}
          >
            {shard.ping ? `${shard.ping}ms` : "--"}
          </span>
          {expandable && (
            <ChevronDown
              className={`w-4 h-4 text-white/30 transition-transform duration-200 ${
                open ? "rotate-180 text-white/60" : ""
              }`}
            />
          )}
        </div>
      </button>

      {open && expandable && (
        <div className="px-3 pb-3 pt-1">
          <div className="rounded-xl border border-white/[0.06] bg-black/40 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-white/30" />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={`Rechercher parmi ${guildsList.length} ${plural(guildsList.length, "serveur")}…`}
                className="flex-1 bg-transparent text-[12px] text-white/80 placeholder:text-white/25 outline-none"
              />
              {query && (
                <span className="text-[10px] text-white/40 font-mono-num">
                  {filteredGuilds.length}/{guildsList.length}
                </span>
              )}
            </div>
            <ul className="max-h-64 overflow-y-auto divide-y divide-white/[0.04]">
              {filteredGuilds.length === 0 ? (
                <li className="py-6 text-center text-[11px] text-white/25 uppercase tracking-widest font-bold">
                  Aucun serveur
                </li>
              ) : (
                filteredGuilds.map(g => (
                  <li
                    key={g.guild_id}
                    className="px-3 py-2 flex items-center justify-between gap-3 hover:bg-white/[0.02]"
                  >
                    <span className="text-[12px] font-medium text-white/80 truncate">
                      {g.guild_name || "Serveur sans nom"}
                    </span>
                    <span className="text-[10px] font-mono-num text-white/30 shrink-0">
                      {g.guild_id}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
