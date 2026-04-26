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
  const badgeClass =
    !bot.online || onlineShards === 0
      ? "bg-red-500/10 border-red-500/15 text-red-400"
      : someOk
      ? "bg-yellow-500/10 border-yellow-500/15 text-yellow-400"
      : "bg-emerald-500/10 border-emerald-500/15 text-emerald-400";
  const badgeDot =
    !bot.online || onlineShards === 0
      ? "bg-red-500 animate-pulse"
      : someOk
      ? "bg-yellow-500"
      : "bg-emerald-500";
  const badgeText =
    !bot.online || onlineShards === 0 ? "Hors ligne" : someOk ? "Dégradé" : "Opérationnel";

  return (
    <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden hover:border-white/10 transition-colors">
      <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
        <img
          src={BOT_IMAGES[bot.label] || ""}
          className="w-9 h-9 rounded-xl border border-white/5"
          alt=""
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold">{bot.label}</span>
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${badgeClass}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${badgeDot}`} />
              <span className="text-[9px] font-bold uppercase tracking-wider">{badgeText}</span>
            </div>
          </div>
          <p className="text-[11px] text-white/25 font-medium mt-0.5 font-mono-num">
            {onlineShards} / {totalShards} shard{totalShards !== 1 ? "s" : ""} en ligne
            <span className="mx-1 text-white/10">·</span>
            {(bot.guilds || 0).toLocaleString("fr-FR")} serveurs
            <span className="mx-1 text-white/10">·</span>
            {(bot.members || 0).toLocaleString("fr-FR")} utilisateurs
          </p>
        </div>
      </div>
      <div className="px-5 divide-y divide-white/[0.04]">
        {sorted.length > 0 ? (
          sorted.map(s => (
            <ShardRow
              key={s.shard_id}
              shard={s}
              pingHistory={pingHistoryByKey.get(`${bot.label}-${s.shard_id}`) || []}
            />
          ))
        ) : (
          <div className="py-8 text-center text-white/20 text-xs font-bold uppercase tracking-widest">
            Aucun shard correspondant
          </div>
        )}
      </div>
    </div>
  );
}
