import { useEffect, useState } from "react";
import { Activity, Cpu, Search, Server, Users, Zap, RefreshCw, X } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Admonition } from "@/components/ui/admonition";
import { BotSection } from "@/components/BotSection";
import { useStats } from "@/hooks/useStats";

function timeSince(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 10) return "il y a quelques secondes";
  if (s < 60) return `il y a ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  return `il y a ${Math.floor(m / 60)} h`;
}

export function Status() {
  const stats = useStats();
  const [query, setQuery] = useState("");

  const canSearch = stats.bots.some(b => b.shards.some(s => (s.guilds_list || []).length > 0));

  // Re-render every 5s for "il y a Xs" freshness
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const lastUpdateText = stats.lastFetch ? timeSince(stats.lastFetch) : "—";

  const incident = !stats.allOnline && !stats.loading;

  return (
    <AppLayout>
      {/* Aurora bleed for depth */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] -z-10 opacity-65">
        <div className={`absolute -top-32 left-[18%] w-[600px] h-[600px] rounded-full blur-3xl ${
          incident ? "bg-red-500/12" : "bg-emerald-500/10"
        }`} />
        <div className="absolute -top-20 right-[18%] w-[500px] h-[500px] rounded-full blur-3xl bg-blue-500/10" />
      </div>

      <section className="container-dashboard pt-20 md:pt-28 pb-32">
        {/* Hero — centered, editorial */}
        <header className="text-center max-w-3xl mx-auto mb-14">
          <p className="text-[11px] font-medium tracking-[0.32em] text-white/35 uppercase mb-6">Surveillance</p>
          <h1 className="font-extrabold leading-[1.02] tracking-[-0.02em] mb-6 text-6xl md:text-7xl">Statut</h1>
          <p className="text-white/55 text-[17px] leading-relaxed">
            État en temps réel de l'infrastructure Shardtown — clusters, shards, latence, charge.
            Mis à jour automatiquement toutes les 30 secondes.
          </p>
        </header>

        <div className="h-px w-full bg-white/[0.06] mb-12" />


        {/* Global health banner */}
        <div className="mb-10">
          {stats.loading ? (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 flex items-center gap-3">
              <RefreshCw className="w-4 h-4 animate-spin text-white/40" />
              <p className="text-sm text-white/60">Connexion à l'API…</p>
            </div>
          ) : incident ? (
            <Admonition type="danger" title="Incident en cours" animate={false}>
              {stats.offlineShards} shard{stats.offlineShards > 1 ? "s" : ""} hors ligne sur {stats.totalShards}.
              {stats.offlineBots > 0 && ` ${stats.offlineBots} cluster${stats.offlineBots > 1 ? "s" : ""} affecté${stats.offlineBots > 1 ? "s" : ""}.`}{" "}
              Nos équipes sont informées · Dernière mise à jour : {lastUpdateText}.
            </Admonition>
          ) : (
            <div className="relative rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] px-5 py-4 backdrop-blur-sm shadow-[0_0_28px_-12px_rgba(16,185,129,0.5)] flex items-center gap-4 flex-wrap">
              <span className="live-dot" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-emerald-200">Tous les systèmes opérationnels</p>
                <p className="text-[12px] text-emerald-300/70 mt-0.5">
                  {stats.totalShards} shards en ligne · latence moyenne {stats.avgPing} ms · aucun incident détecté
                </p>
              </div>
              <p className="text-[11px] text-white/40 flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3" /> {lastUpdateText}
              </p>
            </div>
          )}
        </div>

        {/* KPI grid — 5 ScreenTimeCards (responsive : 1 col mobile, 2 col tablet, 5 col desktop) */}
        <p className="text-sm font-bold tracking-[0.22em] text-white/40 uppercase mb-3">Vue d'ensemble</p>
        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-6">Systèmes</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 mb-14">
          {stats.loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 animate-pulse h-44" />
            ))
          ) : (
            <>
              <KpiTile
                icon={Cpu}
                label="Clusters"
                total={`${stats.onlineBots}/${stats.bots.length}`}
                sub={stats.offlineBots > 0 ? `${stats.offlineBots} hors ligne` : "Tous opérationnels"}
                bars={stats.liveHistory.clusters}
                accent={stats.offlineBots > 0 ? "red" : "emerald"}
              />
              <KpiTile
                icon={Zap}
                label="Shards"
                total={`${stats.onlineShards}/${stats.totalShards}`}
                sub={stats.offlineShards > 0 ? `${stats.offlineShards} hors ligne` : "Tous opérationnels"}
                bars={stats.liveHistory.shards}
                accent={stats.offlineShards > 0 ? "red" : "emerald"}
              />
              <KpiTile
                icon={Server}
                label="Serveurs"
                total={stats.totalGuilds.toLocaleString("fr-FR")}
                sub={`Sur ${stats.bots.length} cluster${stats.bots.length > 1 ? "s" : ""}`}
                bars={stats.liveHistory.guilds}
                accent="blue"
              />
              <KpiTile
                icon={Users}
                label="Membres"
                total={stats.totalMembers >= 1000
                  ? `${(stats.totalMembers / 1000).toFixed(1)}k`
                  : stats.totalMembers.toLocaleString("fr-FR")}
                sub="Total cumulés"
                bars={stats.liveHistory.members}
                accent="violet"
              />
              <KpiTile
                icon={Activity}
                label={`Latence (${stats.avgPing || "—"} ms)`}
                total={stats.avgPing > 0 ? `${stats.avgPing}` : "—"}
                sub={
                  stats.avgPing > 250 ? "Latence élevée"
                  : stats.avgPing > 100 ? "Normal"
                  : stats.avgPing > 0 ? "Excellent"
                  : "Aucune mesure"
                }
                bars={stats.liveHistory.latency}
                accent={stats.avgPing > 250 ? "red" : stats.avgPing > 100 ? "amber" : "emerald"}
              />
            </>
          )}
        </div>

        {/* Activity / per-bot detail */}
        <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-sm font-bold tracking-[0.22em] text-white/40 uppercase mb-2">Activité</p>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Détail par cluster</h2>
          </div>
          {canSearch && (
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-white/35 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="ID ou nom de serveur…"
                className="w-full pl-9 pr-9 py-2.5 text-sm bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder:text-white/30 outline-none focus:border-white/20 focus:bg-white/[0.05] transition-colors font-mono-num"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Effacer"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-white/40 hover:text-white hover:bg-white/[0.06]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {stats.loading ? (
            <>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 animate-pulse h-32" />
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 animate-pulse h-32" />
            </>
          ) : stats.bots.length === 0 ? (
            <div className="text-center py-12 text-white/30 text-xs font-bold uppercase tracking-widest">
              Aucune donnée disponible
            </div>
          ) : (
            stats.bots.map(bot => (
              <BotSection
                key={bot.label}
                bot={bot}
                query={query}
                pingHistoryByKey={stats.pingHistory}
              />
            ))
          )}
        </div>
      </section>
    </AppLayout>
  );
}

/* ─────────── KPI tile (compact ScreenTimeCard variant) ─────────── */

const ACCENT: Record<string, { text: string; bar: string; mute: string }> = {
  emerald: { text: "text-emerald-300", bar: "bg-gradient-to-t from-emerald-500 to-emerald-400/80", mute: "bg-emerald-500/15" },
  blue:    { text: "text-blue-300",    bar: "bg-gradient-to-t from-blue-500 to-blue-400/80",       mute: "bg-blue-500/15" },
  violet:  { text: "text-violet-300",  bar: "bg-gradient-to-t from-violet-500 to-violet-400/80",   mute: "bg-violet-500/15" },
  amber:   { text: "text-amber-300",   bar: "bg-gradient-to-t from-amber-500 to-amber-400/80",     mute: "bg-amber-500/15" },
  red:     { text: "text-red-300",     bar: "bg-gradient-to-t from-red-500 to-red-400/80",         mute: "bg-red-500/15" },
};

function KpiTile({
  icon: Icon,
  label,
  total,
  sub,
  bars,
  accent,
}: {
  icon: typeof Cpu;
  label: string;
  total: string;
  sub: string;
  bars: number[];
  accent: keyof typeof ACCENT;
}) {
  const a = ACCENT[accent];
  // Pad/truncate to 24 bars for a consistent rhythm
  const padded = bars.length === 0 ? Array(24).fill(0) : bars.length < 24 ? Array(24 - bars.length).fill(0).concat(bars) : bars.slice(-24);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent backdrop-blur-sm p-4 hover:border-white/15 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/40 inline-flex items-center gap-1.5">
          <Icon className="w-3 h-3" /> {label}
        </p>
      </div>
      <div className={`text-[26px] font-extrabold leading-none mb-1 font-mono-num ${a.text}`}>{total}</div>
      <p className="text-[10px] text-white/40 font-medium mb-2.5">{sub}</p>
      <ScreenTimeCardCompact data={padded} barClass={a.bar} muteClass={a.mute} />
    </div>
  );
}

/* Inline mini bar graph — uses same styling language as ScreenTimeCard but compact */
function ScreenTimeCardCompact({ data, barClass, muteClass }: { data: number[]; barClass: string; muteClass: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex h-10 items-end gap-[2px]">
      {data.map((v, i) => {
        const h = (v / max) * 100;
        const highlight = h > 60;
        return (
          <span
            key={i}
            className={`flex-1 rounded-t-sm origin-bottom transition-all ${highlight ? barClass : muteClass}`}
            style={{ height: `${Math.max(2, h)}%` }}
          />
        );
      })}
    </div>
  );
}

