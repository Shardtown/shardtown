import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Shard } from "@/lib/types";
import { Sparkline } from "./Sparkline";

interface Props {
  shard: Shard;
  pingHistory: number[];
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
  if (!p) return "text-white/20 bg-white/5";
  if (p < 100) return "text-emerald-400 bg-emerald-500/10";
  if (p < 250) return "text-yellow-400 bg-yellow-500/10";
  return "text-red-400 bg-red-500/10";
}

export function ShardRow({ shard, pingHistory }: Props) {
  const [open, setOpen] = useState(false);
  const isOnline = shard.status === "Online";
  const guilds = shard.guild_count || (shard.guilds_list || []).length;
  const lastUpdateMs = shard.last_update ? new Date(shard.last_update).getTime() : null;
  const timeAgo = lastUpdateMs ? timeSince(lastUpdateMs) : "il y a quelques secondes";
  const sparkColor = !isOnline ? "#ef4444" : shard.ping < 100 ? "#10b981" : shard.ping < 250 ? "#f59e0b" : "#ef4444";
  const hasGuilds = (shard.guilds_list || []).length > 0;

  return (
    <div className="border-b border-white/[0.04] last:border-0 py-3 px-1">
      <div
        className={`flex items-center gap-3 ${hasGuilds ? "cursor-pointer group" : ""}`}
        onClick={() => hasGuilds && setOpen(o => !o)}
      >
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            isOnline
              ? "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]"
              : "bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)] animate-pulse"
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold">
              Shard <span className="text-white/40">#{shard.shard_id}</span>
            </span>
            {!isOnline && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/15 text-red-400 uppercase tracking-wider">
                Hors ligne
              </span>
            )}
          </div>
          <p className="text-[11px] text-white/25 font-medium mt-0.5">
            Mis à jour {timeAgo}
            <span className="mx-1 text-white/10">·</span>
            Serveurs : <span className="text-white/40 font-mono-num">{guilds.toLocaleString("fr-FR")}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {pingHistory.length > 1 && (
            <div className="hidden sm:block" style={{ width: 56, height: 18 }}>
              <Sparkline values={pingHistory} color={sparkColor} width={56} height={18} showDot={false} />
            </div>
          )}
          <span className={`text-[11px] font-bold font-mono-num px-2 py-1 rounded-lg ${getPingClass(shard.ping)}`}>
            {shard.ping ? `${shard.ping}ms` : "--"}
          </span>
          {hasGuilds && (
            <ChevronDown
              className={`w-4 h-4 text-white/20 group-hover:text-white/40 transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
            />
          )}
        </div>
      </div>
      {open && hasGuilds && (
        <div className="mt-2 pt-2 border-t border-white/5 flex flex-wrap gap-1 max-h-28 overflow-y-auto">
          {(shard.guilds_list || []).map(g => (
            <span
              key={g.guild_id}
              className="text-[10px] font-bold text-white/40 bg-white/5 px-2 py-0.5 rounded-full truncate max-w-[160px]"
            >
              {g.guild_name || "Serveur inconnu"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
