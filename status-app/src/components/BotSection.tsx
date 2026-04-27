import { Server, Users, Layers } from "lucide-react";
import type { Bot } from "@/lib/types";
import { ShardRow } from "./ShardRow";

const BOT_IMAGES: Record<string, string> = {
  ShardGuard: "/image/shardguard.png",
  Shard: "/image/shard.png",
};

interface Props {
  bot: Bot;
  filterStatus: string;
  sortBy: string;
  order: string;
  pingHistoryByKey: Map<string, number[]>;
}

const fmt = (n: number) => (n || 0).toLocaleString("fr-FR");
const plural = (n: number, s: string) => (n > 1 ? `${s}s` : s);

export function BotSection({ bot, filterStatus, sortBy, order, pingHistoryByKey }: Props) {
  const totalShards = bot.shards.length;
  const onlineShards = bot.shards.filter(s => s.status === "Online").length;

  const filtered = bot.shards.filter(s => {
    if (filterStatus === "online") return s.status === "Online";
    if (filterStatus === "offline") return s.status !== "Online";
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let va: number, vb: number;
    if (sortBy === "shard_id") { va = a.shard_id; vb = b.shard_id; }
    else if (sortBy === "ping") { va = a.ping || 0; vb = b.ping || 0; }
    else if (sortBy === "guilds") { va = a.guild_count || 0; vb = b.guild_count || 0; }
    else { va = a.last_update ? new Date(a.last_update).getTime() : 0; vb = b.last_update ? new Date(b.last_update).getTime() : 0; }
    return order === "asc" ? va - vb : vb - va;
  });

  const someOk = onlineShards > 0 && onlineShards < totalShards;
  const allDown = !bot.online || onlineShards === 0;

  const statusTone = allDown
    ? { ring: "ring-red-500/40", glow: "shadow-[0_0_24px_-6px_rgba(239,68,68,0.55)]", chip: "bg-red-500/15 border-red-500/25 text-red-300", dot: "bg-red-500 animate-pulse", text: "Hors ligne", accent: "from-red-500/[0.08] via-transparent" }
    : someOk
      ? { ring: "ring-yellow-500/40", glow: "shadow-[0_0_24px_-6px_rgba(234,179,8,0.5)]", chip: "bg-yellow-500/15 border-yellow-500/25 text-yellow-300", dot: "bg-yellow-500", text: "Dégradé", accent: "from-yellow-500/[0.06] via-transparent" }
      : { ring: "ring-emerald-500/40", glow: "shadow-[0_0_24px_-6px_rgba(16,185,129,0.45)]", chip: "bg-emerald-500/15 border-emerald-500/25 text-emerald-300", dot: "bg-emerald-500", text: "Opérationnel", accent: "from-emerald-500/[0.05] via-transparent" };

  return (
    <div className="group relative bg-gradient-to-br from-white/[0.04] via-white/[0.015] to-transparent border border-white/[0.08] rounded-3xl overflow-hidden hover:border-white/15 transition-colors">
      <div className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-b ${statusTone.accent} to-transparent pointer-events-none`} />

      <header className="relative px-5 sm:px-6 pt-5 pb-4 border-b border-white/[0.06]">
        <div className="flex items-start gap-4">
          <div className={`relative shrink-0 ring-2 ${statusTone.ring} ${statusTone.glow} rounded-2xl`}>
            <img
              src={BOT_IMAGES[bot.label] || ""}
              className="w-12 h-12 rounded-2xl bg-black"
              alt=""
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-extrabold tracking-tight text-lg leading-none">{bot.label}</h3>
              <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${statusTone.chip}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusTone.dot}`} />
                <span className="text-[10px] font-bold uppercase tracking-[0.14em]">{statusTone.text}</span>
              </div>
            </div>
            <p className="text-[12px] text-white/40 font-medium mt-1">
              Cluster · {totalShards} {plural(totalShards, "shard")}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Metric icon={Layers} label="Shards en ligne" value={`${onlineShards}/${totalShards}`} />
          <Metric icon={Server} label={plural(bot.guilds || 0, "Serveur")} value={fmt(bot.guilds)} />
          <Metric icon={Users} label="Membres" value={
            (bot.members || 0) >= 10000
              ? `${((bot.members || 0) / 1000).toFixed(1)}k`
              : fmt(bot.members)
          } />
        </div>
      </header>

      <div className="relative px-2 sm:px-3 py-1">
        {sorted.length > 0 ? (
          sorted.map(s => (
            <ShardRow
              key={s.shard_id}
              shard={s}
              pingHistory={pingHistoryByKey.get(`${bot.label}-${s.shard_id}`) || []}
            />
          ))
        ) : (
          <div className="py-10 text-center text-white/25 text-xs font-bold uppercase tracking-widest">
            Aucun shard correspondant
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Server; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] px-3 py-2">
      <div className="flex items-center gap-1.5 text-white/40">
        <Icon className="w-3 h-3" />
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] truncate">{label}</span>
      </div>
      <p className="mt-1 text-base font-extrabold tracking-tight font-mono-num leading-none">{value}</p>
    </div>
  );
}
