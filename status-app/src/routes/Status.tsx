import { useEffect, useState } from "react";
import { Activity, Cpu, Server, Users, Zap } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Banner } from "@/components/Banner";
import { KpiCard } from "@/components/KpiCard";
import { BotSection } from "@/components/BotSection";
import { FilterSelect } from "@/components/FilterSelect";
import { useStats } from "@/hooks/useStats";

function timeSince(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 10) return "il y a quelques secondes";
  if (s < 60) return `il y a ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m}min`;
  return `il y a ${Math.floor(m / 60)}h`;
}

const STATUS_OPTS = [
  { value: "all", label: "Tous les statuts" },
  { value: "online", label: "En ligne" },
  { value: "offline", label: "Hors ligne" },
];
const SORT_OPTS = [
  { value: "last_update", label: "Dernière mise à jour" },
  { value: "shard_id", label: "Shard ID" },
  { value: "ping", label: "Ping" },
  { value: "guilds", label: "Serveurs" },
];
const ORDER_OPTS = [
  { value: "desc", label: "Desc" },
  { value: "asc", label: "Asc" },
];

export function Status() {
  const stats = useStats();
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("last_update");
  const [order, setOrder] = useState("desc");

  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const lastUpdateText = stats.lastFetch ? timeSince(stats.lastFetch) : "--";

  return (
    <AppLayout>
      <section className="container-wide text-center py-20">
        <div className="mb-12">
          <p className="text-sm font-bold tracking-[0.1em] uppercase text-white/40 mb-4">
            Surveillance
          </p>
          <h1
            className="font-extrabold leading-[0.9] tracking-tight mb-8"
            style={{ fontSize: "clamp(3rem, 8vw, 6rem)" }}
          >
            STATUT
          </h1>
        </div>
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold mb-6 tracking-tight">
            EN TEMPS RÉEL.
            <br />
            <span className="text-white/40 uppercase text-lg">
              VISUALISEZ L'ÉTAT DE NOS SYSTÈMES, SHARDS ET CLUSTERS À CHAQUE INSTANT.
            </span>
          </h2>
          <a
            href="#systems"
            className="text-sm font-bold tracking-widest hover:opacity-70 transition-opacity"
          >
            VOIR LES SYSTÈMES &gt;
          </a>
        </div>
      </section>

      <div className="container-wide">
        <Banner
          loading={stats.loading}
          allOnline={stats.allOnline}
          offlineShards={stats.offlineShards}
          avgPing={stats.avgPing}
          lastUpdateText={lastUpdateText}
        />

        <div id="systems" className="mt-16 mb-6">
          <p className="text-sm font-bold tracking-[0.1em] uppercase text-white/40 mb-4">
            Vue d'ensemble
          </p>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3">Systèmes</h2>
          <p className="text-white/40 text-sm">Le statut est mis à jour toutes les 30 secondes.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-14">
          {stats.loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-4 animate-pulse h-28"
              />
            ))
          ) : (
            <>
              <KpiCard
                metric="clusters"
                icon={<Cpu className="w-3.5 h-3.5" strokeWidth={2.5} />}
                value={`${stats.onlineBots}/${stats.bots.length}`}
                subtitle={stats.offlineBots > 0 ? `${stats.offlineBots} hors ligne` : "Tous opérationnels"}
                history={stats.liveHistory.clusters}
                spike={stats.offlineBots > 0}
              />
              <KpiCard
                metric="shards"
                icon={<Zap className="w-3.5 h-3.5" strokeWidth={2.5} />}
                value={`${stats.onlineShards}/${stats.totalShards}`}
                subtitle={stats.offlineShards > 0 ? `${stats.offlineShards} hors ligne` : "Tous opérationnels"}
                history={stats.liveHistory.shards}
                spike={stats.offlineShards > 0}
              />
              <KpiCard
                metric="guilds"
                icon={<Server className="w-3.5 h-3.5" strokeWidth={2.5} />}
                value={stats.totalGuilds.toLocaleString("fr-FR")}
                subtitle={`Sur ${stats.bots.length} cluster${stats.bots.length > 1 ? "s" : ""}`}
                history={stats.liveHistory.guilds}
              />
              <KpiCard
                metric="members"
                icon={<Users className="w-3.5 h-3.5" strokeWidth={2.5} />}
                value={
                  stats.totalMembers >= 1000
                    ? (stats.totalMembers / 1000).toFixed(1) + "k"
                    : stats.totalMembers.toLocaleString("fr-FR")
                }
                subtitle="Total cumulés"
                history={stats.liveHistory.members}
              />
              <KpiCard
                metric="latency"
                icon={<Activity className="w-3.5 h-3.5" strokeWidth={2.5} />}
                value={stats.avgPing || "--"}
                unit="ms"
                subtitle={
                  stats.avgPing > 250
                    ? "Latence élevée"
                    : stats.avgPing > 100
                    ? "Normal"
                    : stats.avgPing > 0
                    ? "Excellent"
                    : "Aucune mesure"
                }
                history={stats.liveHistory.latency}
                spike={stats.avgPing > 250}
              />
            </>
          )}
        </div>

        <div className="mt-16 mb-6">
          <p className="text-sm font-bold tracking-[0.1em] uppercase text-white/40 mb-4">Activité</p>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Mises à jour récentes</h2>
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect options={STATUS_OPTS} value={filterStatus} onChange={setFilterStatus} />
              <FilterSelect options={SORT_OPTS} value={sortBy} onChange={setSortBy} />
              <FilterSelect options={ORDER_OPTS} value={order} onChange={setOrder} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {stats.loading ? (
            <>
              <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-5 animate-pulse h-24" />
              <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-5 animate-pulse h-24" />
            </>
          ) : stats.bots.length === 0 ? (
            <div className="text-center py-12 text-white/20 text-xs font-bold uppercase tracking-widest">
              Aucune donnée disponible
            </div>
          ) : (
            stats.bots.map(bot => (
              <BotSection
                key={bot.label}
                bot={bot}
                filterStatus={filterStatus}
                sortBy={sortBy}
                order={order}
                pingHistoryByKey={stats.pingHistory}
              />
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}
