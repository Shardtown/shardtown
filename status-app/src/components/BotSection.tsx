import { Server, Users, Layers } from "lucide-react";
import type { Bot } from "@/lib/types";
import { ShardRow } from "./ShardRow";

const BOT_IMAGES: Record<string, string> = {
  ShardGuard: "/image/shardguard.png",
  Shard: "/image/shard.png",
};

interface Props {
  bot: Bot;
  query?: string;
  pingHistoryByKey: Map<string, number[]>;
}

const fmt = (n: number) => (n || 0).toLocaleString("fr-FR");
const plural = (n: number, s: string) => (n > 1 ? `${s}s` : s);

export function BotSection({ bot, query = "", pingHistoryByKey }: Props) {
  const totalShards = bot.shards.length;
  const onlineShards = bot.shards.filter(s => s.status === "Online").length;

  const q = query.trim().toLowerCase();
  const matchedShards = q
    ? bot.shards.filter(s =>
        (s.guilds_list || []).some(
          g => g.guild_id.includes(q) || (g.guild_name || "").toLowerCase().includes(q),
        ),
      )
    : bot.shards;

  const sorted = [...matchedShards].sort((a, b) => a.shard_id - b.shard_id);

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
              externalQuery={q || undefined}
            />
          ))
        ) : (
          <div className="py-10 text-center text-white/25 text-xs font-bold uppercase tracking-widest">
            {q ? "Aucun shard ne contient ce serveur" : "Aucun shard"}
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
