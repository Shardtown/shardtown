import { useEffect, useState } from "react";
import { Activity, Loader2 } from "lucide-react";
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

/**
 * Desktop /statut — restrained system status page.
 *
 * Visual language matches /premium and /account (native billing-page vibe) :
 * max-w-920 column, hairline separators, single cards with dense rows,
 * green/red accents only. No mini sparklines, no rainbow KPI tiles, no
 * pulsing aurora.
 */
export function DesktopStatus() {
  const stats = useStats();
  const [, force] = useState(0);

  // Re-render every 5s so the "il y a Xs" timestamp stays fresh.
  useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const lastUpdate = stats.lastFetch ? timeSince(stats.lastFetch) : "—";
  const incident = !stats.allOnline && !stats.loading;

  return (
    <AppLayout>
      <div className="max-w-[920px] mx-auto">
        <StatusHeader
          incident={incident}
          loading={stats.loading}
          offlineShards={stats.offlineShards}
          totalShards={stats.totalShards}
          avgPing={stats.avgPing}
          lastUpdate={lastUpdate}
        />

        <Section title="Vue d'ensemble" subtitle="État global de l'infrastructure en temps réel.">
          {stats.loading ? <Skeleton h={84} /> : <Overview stats={stats} />}
        </Section>

        <Separator />

        <Section title="Services" subtitle="Détail par cluster — un point par shard.">
          {stats.loading ? (
            <Skeleton h={120} />
          ) : stats.bots.length === 0 ? (
            <Empty label="Aucune donnée disponible." />
          ) : (
            <CardList>
              {stats.bots.map(b => <ServiceRow key={b.label} bot={b} />)}
            </CardList>
          )}
        </Section>
      </div>
    </AppLayout>
  );
}

/* ──────────────────────── Status header ──────────────────────── */

function StatusHeader({
  incident, loading,
}: {
  incident: boolean;
  loading: boolean;
  offlineShards: number;
  totalShards: number;
  avgPing: number;
  lastUpdate: string;
}) {
  const accentDot = loading ? "rgba(91, 109, 255, 0.16)" : incident ? "rgba(239, 68, 68, 0.20)" : "rgba(74, 222, 128, 0.20)";
  return (
    <div
      className="relative overflow-hidden rounded-[22px] border mb-6"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
      data-tour="status-header"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, ${accentDot} 1px, transparent 0)`,
          backgroundSize: "24px 24px",
          opacity: 0.5,
          maskImage: "radial-gradient(ellipse at 70% 50%, black 30%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at 70% 50%, black 30%, transparent 70%)",
        }}
      />
      <div className="relative px-7 py-7 flex items-start justify-between gap-6 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <div
            className="w-14 h-14 rounded-[16px] flex items-center justify-center flex-shrink-0"
            style={
              loading
                ? { background: "var(--ds-panel-2)", border: "1px solid var(--ds-border)", color: "var(--ds-text-mut)" }
                : incident
                  ? { background: "rgba(239, 68, 68, 0.10)", border: "1px solid rgba(239, 68, 68, 0.32)", color: "rgb(248, 113, 113)" }
                  : { background: "rgba(74, 222, 128, 0.10)", border: "1px solid rgba(74, 222, 128, 0.32)", color: "rgb(74, 222, 128)" }
            }
          >
            {loading
              ? <Loader2 size={20} className="animate-spin" />
              : <Activity size={20} strokeWidth={1.8} />}
          </div>
          <div className="min-w-0">
            <p
              className="text-[10.5px] font-bold tracking-[0.22em] uppercase mb-1.5 inline-flex items-center gap-2"
              style={{
                color: loading
                  ? "var(--ds-text-dim)"
                  : incident
                    ? "rgb(248, 113, 113)"
                    : "rgb(74, 222, 128)",
              }}
            >
              {!loading && <StatusDot bad={incident} />}
              {loading ? "Surveillance" : incident ? "Incident en cours" : "Tous systèmes opérationnels"}
            </p>
            <h1 className="text-[26px] font-black tracking-tight leading-[1.05]">
              {loading
                ? "Connexion à l'API…"
                : incident
                  ? "Incident détecté."
                  : "Infrastructure stable."}
            </h1>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ bad }: { bad: boolean }) {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full inline-block"
      style={{
        background: bad ? "rgb(248, 113, 113)" : "rgb(74, 222, 128)",
        boxShadow: bad ? "0 0 8px rgba(248, 113, 113, 0.7)" : "0 0 8px rgba(74, 222, 128, 0.65)",
      }}
    />
  );
}

/* ──────────────────────── Overview row ──────────────────────── */

function Overview({ stats }: { stats: ReturnType<typeof useStats> }) {
  const rows = [
    { label: "Clusters",      value: `${stats.onlineBots}/${stats.bots.length}`,    down: stats.offlineBots > 0 },
    { label: "Shards",        value: `${stats.onlineShards}/${stats.totalShards}`,  down: stats.offlineShards > 0 },
    { label: "Serveurs",      value: stats.totalGuilds.toLocaleString("fr-FR"),     down: false },
    { label: "Membres",       value: stats.totalMembers >= 1000 ? `${(stats.totalMembers / 1000).toFixed(1)}k` : stats.totalMembers.toLocaleString("fr-FR"), down: false },
    { label: "Latence moy.",  value: stats.avgPing > 0 ? `${stats.avgPing} ms` : "—", down: false },
  ];
  // Use a 1px gap between cells with the parent bg showing through as the
  // divider — works correctly on both 2-col mobile and 5-col desktop without
  // having to track which cells are at the edge.
  return (
    <div
      className="rounded-[14px] border overflow-hidden grid grid-cols-2 md:grid-cols-5"
      style={{
        background: "var(--ds-border)",
        borderColor: "var(--ds-border)",
        gap: "1px",
      }}
    >
      {rows.map(r => (
        <div
          key={r.label}
          className="px-5 py-3.5"
          style={{ background: "var(--ds-panel)" }}
        >
          <p
            className="text-[10px] font-bold tracking-[0.18em] uppercase mb-1.5"
            style={{ color: "var(--ds-text-dim)" }}
          >
            {r.label}
          </p>
          <p
            className="text-[20px] font-black tracking-tight leading-none font-mono-num"
            style={{ color: r.down ? "rgb(248, 113, 113)" : "var(--ds-text)" }}
          >
            {r.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────── Service row ──────────────────────── */

function ServiceRow({ bot }: { bot: Bot }) {
  const shards = bot.shards || [];
  const total = shards.length;
  const online = shards.filter(s => s.status === "Online").length;
  const onlineShards = shards.filter(s => s.status === "Online");
  const ping = onlineShards.length > 0
    ? Math.round(onlineShards.reduce((a, s) => a + (s.ping || 0), 0) / onlineShards.length)
    : 0;
  const ok = bot.online && online === total;
  const iconSrc = bot.label.toLowerCase().includes("guard")
    ? "/image/shardguard.png"
    : "/image/shard.png";

  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <img
        src={iconSrc}
        alt=""
        className="w-10 h-10 rounded-[11px] object-cover border flex-shrink-0"
        style={{ borderColor: "var(--ds-border)" }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-[13.5px] font-bold truncate">{bot.label}</p>
          <StatusDot bad={!ok} />
        </div>
        <p className="text-[11.5px] font-mono-num" style={{ color: "var(--ds-text-dim)" }}>
          {online}/{total} shards · {bot.guilds.toLocaleString("fr-FR")} serveurs · {ping > 0 ? `${ping} ms` : "—"}
        </p>
      </div>
      <div
        className="flex flex-wrap gap-[3px] max-w-[180px] justify-end shrink-0"
        title={`${online}/${total} shards en ligne`}
      >
        {shards.map(s => {
          const isOk = s.status === "Online";
          return (
            <span
              key={s.shard_id}
              title={`Shard ${s.shard_id} · ${s.status}${s.ping ? ` · ${s.ping} ms` : ""}`}
              className="w-2 h-2 rounded-full"
              style={{
                background: isOk ? "rgb(74, 222, 128)" : "rgb(248, 113, 113)",
                opacity: isOk ? 1 : 0.85,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────────────── Shared primitives ──────────────────────── */

function Section({
  title, subtitle, children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="py-7">
      <div className="mb-4">
        <h2 className="text-[15.5px] font-extrabold tracking-tight mb-1">{title}</h2>
        {subtitle && (
          <p className="text-[12px]" style={{ color: "var(--ds-text-mut)" }}>{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Separator() {
  return <div className="h-px w-full" style={{ background: "var(--ds-border)" }} />;
}

function CardList({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[14px] border overflow-hidden"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
    >
      <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
        {children}
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div
      className="rounded-[14px] border px-4 py-5 text-center text-[12px]"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)", color: "var(--ds-text-dim)" }}
    >
      {label}
    </div>
  );
}

function Skeleton({ h }: { h: number }) {
  return (
    <div
      className="rounded-[14px] animate-pulse"
      style={{ height: h, background: "var(--ds-panel)" }}
    />
  );
}
