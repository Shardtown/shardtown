import { useEffect, useState } from "react";
import { Activity, Cpu, Server, Users, Zap, RefreshCw } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useStats } from "@/hooks/useStats";

function timeSince(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 10) return "à l'instant";
  if (s < 60) return `il y a ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  return `il y a ${Math.floor(m / 60)} h`;
}

/**
 * Desktop status — compact, integrated rendering of the public /status page
 * using the desktop shell's design tokens (--ds-*). One row per service +
 * a compact KPI strip. Polls /api/stats every 30s like the public page.
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
      {/* ─── HEADER ───────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-[26px] font-black tracking-tight leading-tight">Statut des services</h1>
        <p className="text-[13px] mt-1" style={{ color: "var(--ds-text-mut)" }}>
          État temps réel de l'infrastructure Shardtown · mise à jour {lastUpdate}.
        </p>
      </div>

      {/* ─── GLOBAL BANNER ────────────────────────────────────── */}
      <div
        className="rounded-[16px] border px-5 py-4 mb-6 flex items-center gap-4"
        style={
          stats.loading
            ? { background: "var(--ds-panel)", borderColor: "var(--ds-border)" }
            : incident
              ? { background: "rgba(239, 68, 68, 0.08)", borderColor: "rgba(239, 68, 68, 0.35)" }
              : { background: "rgba(74, 222, 128, 0.07)", borderColor: "rgba(74, 222, 128, 0.32)" }
        }
      >
        {stats.loading ? (
          <>
            <RefreshCw size={14} className="animate-spin" style={{ color: "var(--ds-text-dim)" }} />
            <p className="text-[13px]" style={{ color: "var(--ds-text-mut)" }}>Connexion à l'API…</p>
          </>
        ) : (
          <>
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                background: incident ? "rgb(248, 113, 113)" : "rgb(74, 222, 128)",
                boxShadow: incident
                  ? "0 0 10px rgb(248, 113, 113)"
                  : "0 0 10px rgb(74, 222, 128)",
              }}
            />
            <div className="flex-1 min-w-0">
              <p
                className="text-[13.5px] font-bold"
                style={{ color: incident ? "rgb(252, 165, 165)" : "rgb(134, 239, 172)" }}
              >
                {incident ? "Incident en cours" : "Tous les systèmes opérationnels"}
              </p>
              <p className="text-[11.5px] font-medium mt-0.5" style={{ color: "var(--ds-text-mut)" }}>
                {incident
                  ? `${stats.offlineShards} shard${stats.offlineShards > 1 ? "s" : ""} hors ligne sur ${stats.totalShards}.`
                  : `${stats.totalShards} shards en ligne · latence moyenne ${stats.avgPing} ms.`}
              </p>
            </div>
          </>
        )}
      </div>

      {/* ─── KPI STRIP ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-8">
        <Kpi
          icon={<Cpu size={13} strokeWidth={2} />}
          label="Clusters"
          value={`${stats.onlineBots}/${stats.bots.length}`}
          tone={stats.offlineBots > 0 ? "bad" : "ok"}
        />
        <Kpi
          icon={<Zap size={13} strokeWidth={2} />}
          label="Shards"
          value={`${stats.onlineShards}/${stats.totalShards}`}
          tone={stats.offlineShards > 0 ? "bad" : "ok"}
        />
        <Kpi
          icon={<Server size={13} strokeWidth={2} />}
          label="Serveurs"
          value={stats.totalGuilds.toLocaleString("fr-FR")}
          tone="neutral"
        />
        <Kpi
          icon={<Users size={13} strokeWidth={2} />}
          label="Membres"
          value={
            stats.totalMembers >= 1000
              ? `${(stats.totalMembers / 1000).toFixed(1)}k`
              : stats.totalMembers.toLocaleString("fr-FR")
          }
          tone="neutral"
        />
        <Kpi
          icon={<Activity size={13} strokeWidth={2} />}
          label="Latence"
          value={stats.avgPing > 0 ? `${stats.avgPing} ms` : "—"}
          tone={stats.avgPing > 250 ? "bad" : stats.avgPing > 100 ? "warn" : "ok"}
        />
      </div>

      {/* ─── PER-SERVICE ──────────────────────────────────────── */}
      <h2 className="text-[15px] font-extrabold tracking-tight mb-3">Services</h2>
      <div className="flex flex-col gap-2">
        {stats.loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[68px] rounded-[14px] animate-pulse"
              style={{ background: "var(--ds-panel)" }}
            />
          ))
        ) : stats.bots.length === 0 ? (
          <p className="text-[12.5px]" style={{ color: "var(--ds-text-dim)" }}>
            Aucune donnée disponible.
          </p>
        ) : (
          stats.bots.map(bot => {
            const total = bot.shards?.length || 0;
            const online = bot.shards?.filter(s => s.status === "Online").length || 0;
            const ping = online > 0
              ? Math.round(
                  bot.shards!.filter(s => s.status === "Online")
                    .reduce((a, s) => a + (s.ping || 0), 0) / online
                )
              : 0;
            const ok = bot.online && online === total;
            const iconSrc = bot.label.toLowerCase().includes("guard")
              ? "/image/shardguard.png"
              : "/image/shard.png";

            return (
              <div
                key={bot.label}
                className="rounded-[14px] border px-4 py-3 flex items-center gap-4"
                style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
              >
                <img
                  src={iconSrc}
                  alt=""
                  className="w-9 h-9 rounded-[10px] object-cover border flex-shrink-0"
                  style={{ borderColor: "var(--ds-border)" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13.5px] font-bold truncate">{bot.label}</p>
                    <span
                      className="text-[10px] font-bold tracking-[0.12em] uppercase px-2 py-0.5 rounded-full"
                      style={
                        ok
                          ? { background: "rgba(74, 222, 128, 0.12)", color: "rgb(74, 222, 128)" }
                          : { background: "rgba(239, 68, 68, 0.12)", color: "rgb(248, 113, 113)" }
                      }
                    >
                      {ok ? "Opérationnel" : "Dégradé"}
                    </span>
                  </div>
                  <p className="text-[11.5px] font-medium mt-0.5" style={{ color: "var(--ds-text-mut)" }}>
                    {online}/{total} shards · {bot.guilds?.toLocaleString("fr-FR") || 0} serveurs · {ping} ms
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {bot.shards?.map(s => (
                    <span
                      key={s.shard_id}
                      title={`Shard ${s.shard_id} · ${s.status}${s.ping ? ` · ${s.ping} ms` : ""}`}
                      className="w-2 h-2 rounded-full"
                      style={{
                        background:
                          s.status === "Online"
                            ? "rgb(74, 222, 128)"
                            : "rgba(239, 68, 68, 0.8)",
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </AppLayout>
  );
}

function Kpi({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "ok" | "warn" | "bad" | "neutral";
}) {
  const color =
    tone === "ok"      ? "rgb(74, 222, 128)" :
    tone === "warn"    ? "rgb(251, 191, 36)" :
    tone === "bad"     ? "rgb(248, 113, 113)" :
    "var(--ds-text)";
  return (
    <div
      className="rounded-[14px] border px-4 py-3"
      style={{ background: "var(--ds-panel)", borderColor: "var(--ds-border)" }}
    >
      <div
        className="text-[10px] font-bold tracking-[0.18em] uppercase inline-flex items-center gap-1.5 mb-1.5"
        style={{ color: "var(--ds-text-dim)" }}
      >
        {icon}{label}
      </div>
      <p className="text-[20px] font-extrabold tracking-tight leading-none font-mono-num" style={{ color }}>
        {value}
      </p>
    </div>
  );
}
