import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { useStats } from "@/hooks/useStats";
import type { Bot } from "@/lib/types";

function timeSince(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 10) return "à l'instant";
  if (s < 60) return `il y a ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  return `il y a ${Math.floor(m / 60)} h`;
}

const HISTORY_LEN = 24;          // 24 ticks × 30s = 12 minutes
const WINDOW_LABEL = "12 dernières min";

/** Pad/truncate a series to HISTORY_LEN entries. */
function pad(series: number[]): number[] {
  if (series.length === 0) return Array(HISTORY_LEN).fill(NaN);
  if (series.length >= HISTORY_LEN) return series.slice(-HISTORY_LEN);
  return Array(HISTORY_LEN - series.length).fill(NaN).concat(series);
}

type Health = "ok" | "degraded" | "down" | "unknown";

function uptimePercent(states: Health[]): number {
  const known = states.filter(s => s !== "unknown");
  if (known.length === 0) return 100;
  const ok = known.filter(s => s === "ok").length;
  return (ok / known.length) * 100;
}

export function Status() {
  const stats = useStats();
  const reduce = useReducedMotion();
  const heroEase = [0.22, 1, 0.36, 1] as const;

  // Re-render every 5s for fresh "il y a Xs"
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const lastUpdate = stats.lastFetch ? timeSince(stats.lastFetch) : "—";
  const incident = !stats.allOnline && !stats.loading;

  return (
    <AppLayout>
      <section className="container-wide pt-32 md:pt-40 pb-32">
        {/* Hero */}
        <header className="text-center max-w-3xl mx-auto mb-12">
          <motion.p
            className="text-sm font-bold tracking-widest text-white/40 uppercase mb-6"
            initial={{ opacity: 0, y: reduce ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05, ease: heroEase }}
          >
            Statut Shardtown
          </motion.p>
          <motion.h1
            className="font-extrabold leading-[0.95] tracking-tight uppercase mb-6"
            style={{ fontSize: "clamp(2.5rem, 7vw, 5rem)" }}
            initial={{
              opacity: 0,
              x: reduce ? 0 : -80,
              filter: reduce ? "blur(0px)" : "blur(8px)",
            }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.9, delay: 0.15, ease: heroEase }}
          >
            État du système
          </motion.h1>
        </header>

        {/* Banner global */}
        <div className="max-w-3xl mx-auto mb-10">
          <GlobalBanner
            loading={stats.loading}
            incident={incident}
            offlineShards={stats.offlineShards}
            totalShards={stats.totalShards}
            offlineBots={stats.offlineBots}
            lastUpdate={lastUpdate}
          />
        </div>

        {/* Services */}
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-[10px] font-bold tracking-[0.22em] text-white/40 uppercase">
              Services
            </p>
            <p className="text-[11px] text-white/35 inline-flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3" /> {lastUpdate}
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm overflow-hidden divide-y divide-white/[0.06]">
            {stats.loading ? (
              <>
                <ServiceRowSkeleton />
                <ServiceRowSkeleton />
                <ServiceRowSkeleton />
              </>
            ) : (
              <>
                {stats.bots.map(bot => (
                  <ClusterRow
                    key={bot.label}
                    bot={bot}
                    history={stats.liveHistory.shards}
                  />
                ))}
                <ApiRow latencyHistory={stats.liveHistory.latency} avgPing={stats.avgPing} />
              </>
            )}
          </div>

          {/* KPI compact row */}
          <div className="grid grid-cols-2 md:grid-cols-5 mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm overflow-hidden">
            <Kpi label="Clusters"  value={stats.loading ? "—" : `${stats.onlineBots}/${stats.bots.length}`}  down={stats.offlineBots > 0} />
            <Kpi label="Shards"    value={stats.loading ? "—" : `${stats.onlineShards}/${stats.totalShards}`} down={stats.offlineShards > 0} />
            <Kpi label="Serveurs"  value={stats.loading ? "—" : stats.totalGuilds.toLocaleString("fr-FR")} />
            <Kpi label="Membres"   value={stats.loading ? "—" : stats.totalMembers >= 1000 ? `${(stats.totalMembers / 1000).toFixed(1)}k` : stats.totalMembers.toLocaleString("fr-FR")} />
            <Kpi label="Latence"   value={stats.loading ? "—" : stats.avgPing > 0 ? `${stats.avgPing} ms` : "—"} down={stats.avgPing > 250} />
          </div>
        </div>
      </section>
    </AppLayout>
  );
}

/* ────────────────────────────── Banner ────────────────────────────── */

function GlobalBanner({
  loading, incident, offlineShards, totalShards, offlineBots, lastUpdate,
}: {
  loading: boolean;
  incident: boolean;
  offlineShards: number;
  totalShards: number;
  offlineBots: number;
  lastUpdate: string;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 py-5 flex items-center gap-3">
        <RefreshCw className="w-4 h-4 animate-spin text-white/40" />
        <p className="text-sm text-white/60 font-semibold">Connexion à l'API…</p>
      </div>
    );
  }

  if (incident) {
    return (
      <div className="relative rounded-2xl overflow-hidden border border-red-500/40 px-6 py-6 shadow-[0_0_40px_-12px_rgba(239,68,68,0.4)]"
        style={{ background: "linear-gradient(135deg, rgba(220, 38, 38, 0.95), rgba(185, 28, 28, 0.92))" }}
      >
        <div className="flex items-center gap-4">
          <div className="relative flex w-3 h-3 flex-shrink-0">
            <span className="absolute inset-0 rounded-full bg-white animate-ping opacity-60" />
            <span className="relative w-3 h-3 rounded-full bg-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg md:text-xl font-extrabold text-white tracking-tight">
              Incident en cours
            </p>
            <p className="text-[13px] text-white/85 mt-0.5">
              {offlineShards} shard{offlineShards > 1 ? "s" : ""} hors ligne sur {totalShards}
              {offlineBots > 0 ? ` · ${offlineBots} cluster${offlineBots > 1 ? "s" : ""} affecté${offlineBots > 1 ? "s" : ""}` : ""}
              {" · "}MAJ {lastUpdate}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-emerald-500/40 px-6 py-6 shadow-[0_0_40px_-12px_rgba(16,185,129,0.4)]"
      style={{ background: "linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.92))" }}
    >
      <div className="flex items-center gap-4">
        <div className="relative flex w-3 h-3 flex-shrink-0">
          <span className="absolute inset-0 rounded-full bg-white animate-ping opacity-60" />
          <span className="relative w-3 h-3 rounded-full bg-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-lg md:text-xl font-extrabold text-white tracking-tight">
            Tous les systèmes opérationnels
          </p>
          <p className="text-[13px] text-white/85 mt-0.5">
            {totalShards} shard{totalShards > 1 ? "s" : ""} en ligne · MAJ {lastUpdate}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────── Service rows ──────────────────────────── */

function ClusterRow({ bot, history }: { bot: Bot; history: number[] }) {
  const total = bot.shards.length;
  const online = bot.shards.filter(s => s.status === "Online").length;
  const ok = bot.online && online === total;
  const partial = !ok && online > 0;

  // Map global shard-count history to per-cluster health.
  // We don't track per-bot history yet, so use the global series as a proxy :
  // if the system was fully healthy (max value), the bar is green ; otherwise
  // mirror the current degraded/down state.
  const max = Math.max(...history, total);
  const states: Health[] = pad(history).map(v => {
    if (Number.isNaN(v)) return "unknown";
    return v >= max ? "ok" : v > 0 ? "degraded" : "down";
  });
  // Override the most recent bar with the current real state so the bar
  // never lies about *now*.
  states[states.length - 1] = ok ? "ok" : partial ? "degraded" : "down";

  const uptime = uptimePercent(states);
  const iconSrc = bot.label.toLowerCase().includes("guard")
    ? "/image/shardguard.png"
    : "/image/shard.png";

  return (
    <ServiceRow
      icon={<img src={iconSrc} alt="" className="w-8 h-8 rounded-lg object-cover border border-white/10" />}
      title={bot.label}
      subtitle={`${online}/${total} shards · ${bot.guilds.toLocaleString("fr-FR")} serveurs`}
      states={states}
      uptime={uptime}
      status={ok ? "ok" : partial ? "degraded" : "down"}
    />
  );
}

function ApiRow({ latencyHistory, avgPing }: { latencyHistory: number[]; avgPing: number }) {
  const states: Health[] = pad(latencyHistory).map(v => {
    if (Number.isNaN(v) || v === 0) return "unknown";
    if (v < 250) return "ok";
    if (v < 500) return "degraded";
    return "down";
  });
  // Reflect current latency in the most recent bar.
  states[states.length - 1] =
    avgPing === 0 ? "unknown" :
    avgPing < 250 ? "ok" :
    avgPing < 500 ? "degraded" : "down";

  const uptime = uptimePercent(states);
  const current: Health =
    avgPing === 0 ? "unknown" :
    avgPing < 250 ? "ok" :
    avgPing < 500 ? "degraded" : "down";

  return (
    <ServiceRow
      icon={
        <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-300">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
            <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09c-.01-.02-.04-.03-.07-.03c-1.5.26-2.93.71-4.27 1.33c-.01 0-.02.01-.03.02c-2.72 4.07-3.47 8.03-3.1 11.95c0 .02.01.04.03.05c1.8 1.32 3.53 2.12 5.24 2.65c.03.01.06 0 .07-.02c.4-.55.76-1.13 1.07-1.74c.02-.04 0-.08-.04-.09c-.57-.22-1.11-.48-1.64-.78c-.04-.02-.04-.08-.01-.11c.11-.08.22-.17.33-.25c.02-.02.05-.02.07-.01c3.44 1.57 7.15 1.57 10.55 0c.02-.01.05-.01.07.01c.11.09.22.17.33.26c.04.03.04.09-.01.11c-.52.31-1.07.56-1.64.78c-.04.01-.05.06-.04.09c.32.61.68 1.19 1.07 1.74c.03.01.06.02.09.01c1.72-.53 3.45-1.33 5.25-2.65c.02-.01.03-.03.03-.05c.44-4.53-.73-8.46-3.1-11.95c-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.83 2.12-1.89 2.12z"/>
          </svg>
        </div>
      }
      title="API Discord"
      subtitle={avgPing > 0 ? `${avgPing} ms en moyenne` : "Aucune mesure"}
      states={states}
      uptime={uptime}
      status={current === "unknown" ? "ok" : current}
    />
  );
}

function ServiceRow({
  icon, title, subtitle, states, uptime, status,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  states: Health[];
  uptime: number;
  status: Health;
}) {
  const label =
    status === "ok"       ? "Opérationnel"
    : status === "degraded" ? "Dégradé"
    : status === "down"    ? "Hors ligne"
    : "Inconnu";

  const labelColor =
    status === "ok"       ? "text-emerald-300"
    : status === "degraded" ? "text-amber-300"
    : status === "down"    ? "text-red-300"
    : "text-white/40";

  return (
    <div className="p-5 md:p-6">
      <div className="flex items-center gap-4 mb-3">
        <div className="flex-shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold leading-tight">{title}</p>
          <p className="text-[12px] text-white/45 mt-0.5">{subtitle}</p>
        </div>
        <p className={`text-[12px] font-bold ${labelColor}`}>{label}</p>
      </div>

      <UptimeBars states={states} />

      <div className="flex justify-between items-center mt-2 text-[11px] text-white/35 font-mono-num">
        <span>{WINDOW_LABEL}</span>
        <span className={labelColor + " font-bold tabular-nums"}>{uptime.toFixed(1)} % uptime</span>
        <span>maintenant</span>
      </div>
    </div>
  );
}

function UptimeBars({ states }: { states: Health[] }) {
  return (
    <div className="flex h-9 gap-[3px]">
      {states.map((s, i) => {
        const cls =
          s === "ok"       ? "bg-emerald-500"
          : s === "degraded" ? "bg-amber-500"
          : s === "down"    ? "bg-red-500"
          : "bg-white/10";
        return (
          <span
            key={i}
            className={`flex-1 rounded-sm transition-colors ${cls}`}
            aria-label={s}
          />
        );
      })}
    </div>
  );
}

function ServiceRowSkeleton() {
  return (
    <div className="p-5 md:p-6 animate-pulse">
      <div className="flex items-center gap-4 mb-3">
        <div className="w-8 h-8 rounded-lg bg-white/[0.06]" />
        <div className="flex-1">
          <div className="h-3 w-24 bg-white/[0.06] rounded" />
          <div className="h-2 w-40 bg-white/[0.04] rounded mt-2" />
        </div>
        <div className="h-3 w-16 bg-white/[0.06] rounded" />
      </div>
      <div className="flex h-9 gap-[3px]">
        {Array.from({ length: HISTORY_LEN }).map((_, i) => (
          <span key={i} className="flex-1 rounded-sm bg-white/[0.06]" />
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, down }: { label: string; value: string; down?: boolean }) {
  return (
    <div className="px-5 py-4 border-r last:border-r-0 border-white/[0.06] [border-right-style:solid] [&:nth-child(2)]:border-r-0 md:[&:nth-child(2)]:border-r [&:nth-child(2n)]:border-r-0 md:[&:nth-child(2n)]:border-r">
      <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/40 mb-1.5">{label}</p>
      <p className={`text-[20px] font-extrabold tracking-tight leading-none font-mono-num ${down ? "text-red-300" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}
