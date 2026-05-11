import { useEffect, useState } from "react";
import { Activity, Cpu, Server, Users, Zap, RefreshCw } from "lucide-react";
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
 * Desktop status — rich, NordVPN-style rendering of the public /status page.
 * Hero banner with live pulse, KPI tiles with sparklines, service cards with
 * ping graphs and shard grids. Polls /api/stats every 30s.
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
      {/* ─── HERO ─────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-[22px] border mb-4 status-hero"
        style={{ borderColor: "var(--ds-border)" }}
        data-incident={incident ? "1" : "0"}
      >
        <div className="absolute inset-0 status-hero-bg" />

        <div className="relative px-8 py-10">
          <p
            className="text-[11px] font-bold tracking-[0.22em] uppercase mb-3"
            style={{ color: "var(--ds-text-dim)" }}
          >
            Surveillance temps réel
          </p>

          <div className="flex items-end gap-5 flex-wrap">
            <div className="flex items-center gap-3.5">
              {stats.loading ? (
                <RefreshCw size={26} className="animate-spin" style={{ color: "var(--ds-text-dim)" }} />
              ) : (
                <span className={`live-pulse ${incident ? "is-bad" : "is-ok"}`} aria-hidden />
              )}
              <h1 className="text-[34px] font-black tracking-tight leading-[1] m-0">
                {stats.loading
                  ? "Chargement…"
                  : incident
                    ? "Incident en cours"
                    : "Tous les systèmes opérationnels"}
              </h1>
            </div>
          </div>

          <p className="text-[13px] font-medium mt-3 max-w-2xl" style={{ color: "var(--ds-text-mut)" }}>
            {stats.loading
              ? "Connexion à l'API de monitoring…"
              : incident
                ? `${stats.offlineShards} shard${stats.offlineShards > 1 ? "s" : ""} hors ligne sur ${stats.totalShards}. ${
                    stats.offlineBots > 0
                      ? `${stats.offlineBots} cluster${stats.offlineBots > 1 ? "s" : ""} affecté${stats.offlineBots > 1 ? "s" : ""}. `
                      : ""
                  }Nos équipes sont informées.`
                : `${stats.totalShards} shards actifs, ${stats.totalGuilds.toLocaleString("fr-FR")} serveurs, latence moyenne ${stats.avgPing} ms.`}
          </p>

          <div
            className="mt-6 inline-flex items-center gap-2 text-[11.5px] font-semibold px-3 py-1.5 rounded-full"
            style={{
              background: "var(--ds-panel-2)",
              color: "var(--ds-text-mut)",
              border: "1px solid var(--ds-border)",
            }}
          >
            <RefreshCw size={11} strokeWidth={2.4} className={stats.loading ? "animate-spin" : ""} />
            Mis à jour {lastUpdate}
          </div>
        </div>

        <style>{`
          .status-hero {
            background: linear-gradient(135deg, #101226 0%, #0d0e15 70%);
          }
          .status-hero[data-incident="1"] {
            background: linear-gradient(135deg, #2a1216 0%, #110d0f 70%);
          }
          [data-theme="light"] .status-hero {
            background: linear-gradient(135deg, #e7f5ee 0%, #f5f5f7 70%);
          }
          [data-theme="light"] .status-hero[data-incident="1"] {
            background: linear-gradient(135deg, #fce6e9 0%, #f5f5f7 70%);
          }
          .status-hero-bg {
            background-image:
              radial-gradient(circle at 1px 1px, rgba(74, 222, 128, 0.30) 1px, transparent 0);
            background-size: 24px 24px;
            opacity: 0.35;
            mask-image: radial-gradient(ellipse at 80% 50%, black 30%, transparent 70%);
            -webkit-mask-image: radial-gradient(ellipse at 80% 50%, black 30%, transparent 70%);
          }
          .status-hero[data-incident="1"] .status-hero-bg {
            background-image:
              radial-gradient(circle at 1px 1px, rgba(248, 113, 113, 0.35) 1px, transparent 0);
          }
          [data-theme="light"] .status-hero-bg {
            background-image:
              radial-gradient(circle at 1px 1px, rgba(16, 185, 129, 0.45) 1px, transparent 0);
          }
          [data-theme="light"] .status-hero[data-incident="1"] .status-hero-bg {
            background-image:
              radial-gradient(circle at 1px 1px, rgba(220, 38, 38, 0.45) 1px, transparent 0);
          }
          .live-pulse {
            width: 14px; height: 14px; border-radius: 999px; position: relative;
            display: inline-block;
          }
          .live-pulse::after {
            content: ""; position: absolute; inset: -6px; border-radius: 999px;
            animation: pulse-ring 2s ease-out infinite;
          }
          .live-pulse.is-ok { background: rgb(74, 222, 128); box-shadow: 0 0 14px rgb(74, 222, 128); }
          .live-pulse.is-ok::after { background: rgb(74, 222, 128); opacity: 0.35; }
          .live-pulse.is-bad { background: rgb(248, 113, 113); box-shadow: 0 0 14px rgb(248, 113, 113); }
          .live-pulse.is-bad::after { background: rgb(248, 113, 113); opacity: 0.35; }
          @keyframes pulse-ring {
            0%   { transform: scale(0.85); opacity: 0.55; }
            70%  { transform: scale(1.6);  opacity: 0; }
            100% { transform: scale(1.6);  opacity: 0; }
          }
        `}</style>
      </div>

      {/* ─── KPI STRIP ────────────────────────────────────────── */}
      <p
        className="text-[11px] font-bold tracking-[0.22em] uppercase mb-3 mt-8"
        style={{ color: "var(--ds-text-dim)" }}
      >
        Vue d'ensemble
      </p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-10">
        {stats.loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-[120px] rounded-[16px] animate-pulse"
              style={{ background: "var(--ds-panel)" }}
            />
          ))
        ) : (
          <>
            <KpiTile
              icon={<Cpu size={12} strokeWidth={2} />}
              label="Clusters"
              value={`${stats.onlineBots}/${stats.bots.length}`}
              sub={stats.offlineBots > 0 ? `${stats.offlineBots} hors ligne` : "Tous opérationnels"}
              bars={stats.liveHistory.clusters}
              tone={stats.offlineBots > 0 ? "bad" : "ok"}
            />
            <KpiTile
              icon={<Zap size={12} strokeWidth={2} />}
              label="Shards"
              value={`${stats.onlineShards}/${stats.totalShards}`}
              sub={stats.offlineShards > 0 ? `${stats.offlineShards} hors ligne` : "Tous opérationnels"}
              bars={stats.liveHistory.shards}
              tone={stats.offlineShards > 0 ? "bad" : "ok"}
            />
            <KpiTile
              icon={<Server size={12} strokeWidth={2} />}
              label="Serveurs"
              value={stats.totalGuilds.toLocaleString("fr-FR")}
              sub={`Sur ${stats.bots.length} cluster${stats.bots.length > 1 ? "s" : ""}`}
              bars={stats.liveHistory.guilds}
              tone="blue"
            />
            <KpiTile
              icon={<Users size={12} strokeWidth={2} />}
              label="Membres"
              value={
                stats.totalMembers >= 1000
                  ? `${(stats.totalMembers / 1000).toFixed(1)}k`
                  : stats.totalMembers.toLocaleString("fr-FR")
              }
              sub="Total cumulés"
              bars={stats.liveHistory.members}
              tone="violet"
            />
            <KpiTile
              icon={<Activity size={12} strokeWidth={2} />}
              label="Latence"
              value={stats.avgPing > 0 ? `${stats.avgPing} ms` : "—"}
              sub={
                stats.avgPing > 250
                  ? "Latence élevée"
                  : stats.avgPing > 100
                    ? "Normal"
                    : stats.avgPing > 0
                      ? "Excellent"
                      : "Aucune mesure"
              }
              bars={stats.liveHistory.latency}
              tone={stats.avgPing > 250 ? "bad" : stats.avgPing > 100 ? "warn" : "ok"}
            />
          </>
        )}
      </div>

      {/* ─── SERVICES ─────────────────────────────────────────── */}
      <p
        className="text-[11px] font-bold tracking-[0.22em] uppercase mb-3"
        style={{ color: "var(--ds-text-dim)" }}
      >
        Détail par cluster
      </p>

      <div className="flex flex-col gap-3 mb-4">
        {stats.loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-[150px] rounded-[18px] animate-pulse"
              style={{ background: "var(--ds-panel)" }}
            />
          ))
        ) : stats.bots.length === 0 ? (
          <p className="text-[12.5px]" style={{ color: "var(--ds-text-dim)" }}>
            Aucune donnée disponible.
          </p>
        ) : (
          stats.bots.map(bot => (
            <ServiceCard
              key={bot.label}
              bot={bot}
              pingHistory={stats.pingHistory}
            />
          ))
        )}
      </div>
    </AppLayout>
  );
}

/* ───────────────────────── KPI TILE ───────────────────────── */

type Tone = "ok" | "warn" | "bad" | "blue" | "violet";
const TONE_COLORS: Record<Tone, { text: string; bar: string; mute: string }> = {
  ok:     { text: "rgb(74, 222, 128)",  bar: "rgb(74, 222, 128)",  mute: "rgba(74, 222, 128, 0.16)" },
  warn:   { text: "rgb(251, 191, 36)",  bar: "rgb(251, 191, 36)",  mute: "rgba(251, 191, 36, 0.16)" },
  bad:    { text: "rgb(248, 113, 113)", bar: "rgb(248, 113, 113)", mute: "rgba(248, 113, 113, 0.16)" },
  blue:   { text: "rgb(96, 165, 250)",  bar: "rgb(96, 165, 250)",  mute: "rgba(96, 165, 250, 0.16)" },
  violet: { text: "rgb(167, 139, 250)", bar: "rgb(167, 139, 250)", mute: "rgba(167, 139, 250, 0.16)" },
};

function KpiTile({
  icon, label, value, sub, bars, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  bars: number[];
  tone: Tone;
}) {
  const c = TONE_COLORS[tone];
  const padded = bars.length === 0
    ? Array(24).fill(0)
    : bars.length < 24
      ? Array(24 - bars.length).fill(0).concat(bars)
      : bars.slice(-24);

  return (
    <div
      className="rounded-[16px] border p-4 transition-colors hover:border-[var(--ds-border-strong)]"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
    >
      <div
        className="text-[10px] font-bold tracking-[0.18em] uppercase inline-flex items-center gap-1.5 mb-2"
        style={{ color: "var(--ds-text-dim)" }}
      >
        {icon}{label}
      </div>
      <p
        className="text-[24px] font-extrabold leading-none tracking-tight font-mono-num mb-1"
        style={{ color: c.text }}
      >
        {value}
      </p>
      <p className="text-[11px] font-semibold mb-3" style={{ color: "var(--ds-text-dim)" }}>
        {sub}
      </p>
      <MiniBars data={padded} color={c.bar} mute={c.mute} />
    </div>
  );
}

function MiniBars({ data, color, mute }: { data: number[]; color: string; mute: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex h-9 items-end gap-[2px]">
      {data.map((v, i) => {
        const h = (v / max) * 100;
        const hi = h > 60;
        return (
          <span
            key={i}
            className="flex-1 rounded-t-[2px]"
            style={{ height: `${Math.max(3, h)}%`, background: hi ? color : mute }}
          />
        );
      })}
    </div>
  );
}

/* ───────────────────────── SERVICE CARD ───────────────────────── */

function ServiceCard({
  bot, pingHistory,
}: {
  bot: Bot;
  pingHistory: Map<string, number[]>;
}) {
  const shards = bot.shards || [];
  const online = shards.filter(s => s.status === "Online").length;
  const total = shards.length;
  const onlinePings = shards.filter(s => s.status === "Online");
  const ping = onlinePings.length > 0
    ? Math.round(onlinePings.reduce((a, s) => a + (s.ping || 0), 0) / onlinePings.length)
    : 0;
  const ok = bot.online && online === total;
  const iconSrc = bot.label.toLowerCase().includes("guard")
    ? "/image/shardguard.png"
    : "/image/shard.png";

  // Aggregate ping history across shards of this bot
  const agg: number[] = [];
  for (const s of shards) {
    const arr = pingHistory.get(`${bot.label}-${s.shard_id}`) || [];
    for (let i = 0; i < arr.length; i++) {
      agg[i] = (agg[i] || 0) + arr[i];
    }
  }
  const avgPing = agg.map(v => Math.round(v / Math.max(shards.length, 1)));

  return (
    <div
      className="rounded-[18px] border overflow-hidden"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
    >
      <div className="px-5 py-4 flex items-center gap-4 border-b" style={{ borderColor: "var(--ds-border)" }}>
        <img
          src={iconSrc}
          alt=""
          className="w-11 h-11 rounded-[12px] object-cover border flex-shrink-0"
          style={{ borderColor: "var(--ds-border)" }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[15px] font-extrabold tracking-tight">{bot.label}</p>
            <span
              className="text-[10px] font-bold tracking-[0.12em] uppercase px-2 py-0.5 rounded-full inline-flex items-center gap-1.5"
              style={
                ok
                  ? { background: "rgba(74, 222, 128, 0.12)", color: "rgb(74, 222, 128)" }
                  : { background: "rgba(248, 113, 113, 0.12)", color: "rgb(248, 113, 113)" }
              }
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: ok ? "rgb(74, 222, 128)" : "rgb(248, 113, 113)" }}
              />
              {ok ? "Opérationnel" : "Dégradé"}
            </span>
          </div>
          <p className="text-[11.5px] font-medium mt-0.5" style={{ color: "var(--ds-text-mut)" }}>
            Cluster Discord · {total} shard{total > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1.4fr] gap-0">
        <Cell label="Shards en ligne" value={`${online}/${total}`} tone={online === total ? "ok" : "bad"} />
        <Cell label="Serveurs" value={bot.guilds.toLocaleString("fr-FR")} />
        <Cell label="Latence" value={ping > 0 ? `${ping} ms` : "—"} tone={ping > 250 ? "bad" : ping > 100 ? "warn" : ping > 0 ? "ok" : "neutral"} />
        <Cell label="Ping (24 derniers ticks)" custom={<MiniBars data={padTo24(avgPing)} color="rgb(96, 165, 250)" mute="rgba(96, 165, 250, 0.16)" />} />
      </div>

      {/* Shard grid */}
      <div className="px-5 py-4 border-t" style={{ borderColor: "var(--ds-border)" }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: "var(--ds-text-dim)" }}>
            Shards
          </p>
          <p className="text-[11px] font-mono-num" style={{ color: "var(--ds-text-dim)" }}>
            {online}/{total}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {shards.map(s => {
            const isOk = s.status === "Online";
            const ms = s.ping || 0;
            return (
              <div
                key={s.shard_id}
                title={`Shard ${s.shard_id} · ${s.status}${ms ? ` · ${ms} ms` : ""}`}
                className="px-2 h-7 rounded-[8px] inline-flex items-center gap-1.5 text-[10.5px] font-bold font-mono-num"
                style={{
                  background: isOk ? "rgba(74, 222, 128, 0.08)" : "rgba(248, 113, 113, 0.10)",
                  border: `1px solid ${isOk ? "rgba(74, 222, 128, 0.25)" : "rgba(248, 113, 113, 0.30)"}`,
                  color: isOk ? "rgb(134, 239, 172)" : "rgb(252, 165, 165)",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: isOk ? "rgb(74, 222, 128)" : "rgb(248, 113, 113)" }}
                />
                #{s.shard_id}
                {isOk && ms > 0 && (
                  <span style={{ color: "var(--ds-text-dim)" }}>· {ms}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function padTo24(arr: number[]): number[] {
  if (arr.length === 0) return Array(24).fill(0);
  if (arr.length >= 24) return arr.slice(-24);
  return Array(24 - arr.length).fill(0).concat(arr);
}

function Cell({
  label, value, tone = "neutral", custom,
}: {
  label: string;
  value?: string;
  tone?: "ok" | "warn" | "bad" | "neutral";
  custom?: React.ReactNode;
}) {
  const color =
    tone === "ok"   ? "rgb(74, 222, 128)" :
    tone === "warn" ? "rgb(251, 191, 36)" :
    tone === "bad"  ? "rgb(248, 113, 113)" :
    "var(--ds-text)";
  return (
    <div
      className="px-5 py-4 border-r last:border-r-0 border-b md:border-b-0"
      style={{ borderColor: "var(--ds-border)" }}
    >
      <p
        className="text-[10px] font-bold tracking-[0.18em] uppercase mb-1.5"
        style={{ color: "var(--ds-text-dim)" }}
      >
        {label}
      </p>
      {custom ? (
        custom
      ) : (
        <p className="text-[18px] font-extrabold leading-none tracking-tight font-mono-num" style={{ color }}>
          {value}
        </p>
      )}
    </div>
  );
}
