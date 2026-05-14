import { useEffect, useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
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

const HISTORY_LEN = 24; // 24 ticks × 30 s = 12 min
const WINDOW_LABEL = "12 dernières min";

type Health = "ok" | "degraded" | "down" | "unknown";

function pad(series: number[]): number[] {
  if (series.length === 0) return Array(HISTORY_LEN).fill(NaN);
  if (series.length >= HISTORY_LEN) return series.slice(-HISTORY_LEN);
  return Array(HISTORY_LEN - series.length).fill(NaN).concat(series);
}

function uptimePercent(states: Health[]): number {
  const known = states.filter(s => s !== "unknown");
  if (known.length === 0) return 100;
  return (known.filter(s => s === "ok").length / known.length) * 100;
}

/**
 * Desktop /statut — visual language uses var(--ds-*) tokens so it adapts to
 * the aurora / noir / light themes. Layout aligned on the cronitor-style
 * status page : global banner + service rows with uptime bars.
 */
export function DesktopStatus() {
  const stats = useStats();
  const [, force] = useState(0);

  useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const lastUpdate = stats.lastFetch ? timeSince(stats.lastFetch) : "—";
  const incident = !stats.allOnline && !stats.loading;

  return (
    <AppLayout>
      <div className="max-w-[920px] mx-auto">
        <Banner
          loading={stats.loading}
          incident={incident}
          offlineShards={stats.offlineShards}
          totalShards={stats.totalShards}
          offlineBots={stats.offlineBots}
          lastUpdate={lastUpdate}
        />

        <div className="flex items-center justify-between mb-3 px-1">
          <p
            className="text-[10.5px] font-bold tracking-[0.22em] uppercase"
            style={{ color: "var(--ds-text-mut)" }}
          >
            Services
          </p>
          <p
            className="text-[11px] inline-flex items-center gap-1.5"
            style={{ color: "var(--ds-text-dim)" }}
          >
            <RefreshCw className="w-3 h-3" /> {lastUpdate}
          </p>
        </div>

        <div
          className="rounded-[16px] border overflow-hidden divide-y"
          style={{
            background: "var(--ds-panel)",
            borderColor: "var(--ds-border)",
          }}
        >
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

        {/* Vue d'ensemble compacte */}
        <div
          className="mt-6 rounded-[16px] border grid grid-cols-2 md:grid-cols-5 overflow-hidden"
          style={{
            background: "var(--ds-border)",
            borderColor: "var(--ds-border)",
            gap: "1px",
          }}
        >
          <Kpi label="Clusters"  value={stats.loading ? "—" : `${stats.onlineBots}/${stats.bots.length}`}  down={stats.offlineBots > 0} />
          <Kpi label="Shards"    value={stats.loading ? "—" : `${stats.onlineShards}/${stats.totalShards}`} down={stats.offlineShards > 0} />
          <Kpi label="Serveurs"  value={stats.loading ? "—" : stats.totalGuilds.toLocaleString("fr-FR")} />
          <Kpi label="Membres"   value={stats.loading ? "—" : stats.totalMembers >= 1000 ? `${(stats.totalMembers / 1000).toFixed(1)}k` : stats.totalMembers.toLocaleString("fr-FR")} />
          <Kpi label="Latence"   value={stats.loading ? "—" : stats.avgPing > 0 ? `${stats.avgPing} ms` : "—"} down={stats.avgPing > 250} />
        </div>
      </div>
    </AppLayout>
  );
}

/* ──────────────────────── Banner ──────────────────────── */

function Banner({
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
      <div
        className="rounded-[18px] border px-6 py-5 flex items-center gap-3 mb-6"
        style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
      >
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--ds-text-mut)" }} />
        <p className="text-[13px] font-semibold" style={{ color: "var(--ds-text-mut)" }}>
          Connexion à l'API…
        </p>
      </div>
    );
  }

  if (incident) {
    return (
      <div
        className="relative overflow-hidden rounded-[18px] border px-6 py-6 mb-6 shadow-[0_0_40px_-16px_rgba(239,68,68,0.45)]"
        style={{
          background: "linear-gradient(135deg, rgba(220, 38, 38, 0.92), rgba(185, 28, 28, 0.88))",
          borderColor: "rgba(239, 68, 68, 0.45)",
        }}
      >
        <div className="flex items-center gap-4">
          <div className="relative flex w-3 h-3 flex-shrink-0">
            <span className="absolute inset-0 rounded-full bg-white animate-ping opacity-60" />
            <span className="relative w-3 h-3 rounded-full bg-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[18px] font-extrabold text-white tracking-tight leading-tight">
              Incident en cours
            </p>
            <p className="text-[12.5px] text-white/85 mt-0.5">
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
    <div
      className="relative overflow-hidden rounded-[18px] border px-6 py-6 mb-6 shadow-[0_0_40px_-16px_rgba(16,185,129,0.45)]"
      style={{
        background: "linear-gradient(135deg, rgba(16, 185, 129, 0.92), rgba(5, 150, 105, 0.88))",
        borderColor: "rgba(16, 185, 129, 0.45)",
      }}
    >
      <div className="flex items-center gap-4">
        <div className="relative flex w-3 h-3 flex-shrink-0">
          <span className="absolute inset-0 rounded-full bg-white animate-ping opacity-60" />
          <span className="relative w-3 h-3 rounded-full bg-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[18px] font-extrabold text-white tracking-tight leading-tight">
            Tous les systèmes opérationnels
          </p>
          <p className="text-[12.5px] text-white/85 mt-0.5">
            {totalShards} shard{totalShards > 1 ? "s" : ""} en ligne · MAJ {lastUpdate}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────── Service rows ──────────────────────── */

function ClusterRow({ bot, history }: { bot: Bot; history: number[] }) {
  const total = bot.shards.length;
  const online = bot.shards.filter(s => s.status === "Online").length;
  const ok = bot.online && online === total;
  const partial = !ok && online > 0;

  const max = Math.max(...history, total);
  const states: Health[] = pad(history).map(v => {
    if (Number.isNaN(v)) return "unknown";
    return v >= max ? "ok" : v > 0 ? "degraded" : "down";
  });
  states[states.length - 1] = ok ? "ok" : partial ? "degraded" : "down";

  const uptime = uptimePercent(states);
  const iconSrc = bot.label.toLowerCase().includes("guard")
    ? "/image/shardguard.png"
    : "/image/shard.png";

  return (
    <ServiceRow
      icon={
        <img
          src={iconSrc}
          alt=""
          className="w-9 h-9 rounded-[10px] object-cover border"
          style={{ borderColor: "var(--ds-border)" }}
        />
      }
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
        <div
          className="w-9 h-9 rounded-[10px] flex items-center justify-center"
          style={{
            background: "rgba(91, 109, 255, 0.14)",
            border: "1px solid rgba(91, 109, 255, 0.32)",
            color: "rgb(165, 180, 252)",
          }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
            <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
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

  const colorVar =
    status === "ok"       ? "var(--ds-status-ok)"
    : status === "degraded" ? "var(--ds-status-warn)"
    : status === "down"    ? "var(--ds-status-err)"
    : "var(--ds-text-dim)";

  return (
    <div className="px-5 py-4" style={{ borderColor: "var(--ds-border)" }}>
      <div className="flex items-center gap-4 mb-3">
        <div className="flex-shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold leading-tight">{title}</p>
          <p className="text-[11.5px] mt-0.5" style={{ color: "var(--ds-text-mut)" }}>{subtitle}</p>
        </div>
        <p className="text-[12px] font-bold" style={{ color: colorVar }}>{label}</p>
      </div>

      <UptimeBars states={states} />

      <div
        className="flex justify-between items-center mt-2 text-[10.5px] font-mono-num"
        style={{ color: "var(--ds-text-dim)" }}
      >
        <span>{WINDOW_LABEL}</span>
        <span className="font-bold tabular-nums" style={{ color: colorVar }}>
          {uptime.toFixed(1)} % uptime
        </span>
        <span>maintenant</span>
      </div>
    </div>
  );
}

function UptimeBars({ states }: { states: Health[] }) {
  return (
    <div className="flex h-9 gap-[3px]">
      {states.map((s, i) => {
        const bg =
          s === "ok"       ? "var(--ds-status-ok)"
          : s === "degraded" ? "var(--ds-status-warn)"
          : s === "down"    ? "var(--ds-status-err)"
          : "var(--ds-panel-2)";
        return (
          <span
            key={i}
            className="flex-1 rounded-sm transition-colors"
            style={{ background: bg }}
            aria-label={s}
          />
        );
      })}
    </div>
  );
}

function ServiceRowSkeleton() {
  return (
    <div className="px-5 py-4 animate-pulse">
      <div className="flex items-center gap-4 mb-3">
        <div className="w-9 h-9 rounded-[10px]" style={{ background: "var(--ds-panel-2)" }} />
        <div className="flex-1">
          <div className="h-3 w-24 rounded" style={{ background: "var(--ds-panel-2)" }} />
          <div className="h-2 w-40 rounded mt-2" style={{ background: "var(--ds-panel-2)" }} />
        </div>
        <div className="h-3 w-16 rounded" style={{ background: "var(--ds-panel-2)" }} />
      </div>
      <div className="flex h-9 gap-[3px]">
        {Array.from({ length: HISTORY_LEN }).map((_, i) => (
          <span key={i} className="flex-1 rounded-sm" style={{ background: "var(--ds-panel-2)" }} />
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, down }: { label: string; value: string; down?: boolean }) {
  return (
    <div className="px-5 py-3.5" style={{ background: "var(--ds-panel)" }}>
      <p
        className="text-[10px] font-bold tracking-[0.18em] uppercase mb-1.5"
        style={{ color: "var(--ds-text-dim)" }}
      >
        {label}
      </p>
      <p
        className="text-[19px] font-black tracking-tight leading-none font-mono-num"
        style={{ color: down ? "var(--ds-status-err)" : "var(--ds-text)" }}
      >
        {value}
      </p>
    </div>
  );
}
