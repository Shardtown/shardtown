import { useEffect, useRef, useState } from "react";
import type { Bot, StatsResponse } from "@/lib/types";
import { apiGet } from "@/api/client";

const SPARK_MAX = 24; // 24 points × 1h = 24 dernières heures

export interface LiveHistory {
  clusters: number[];
  shards: number[];
  guilds: number[];
  members: number[];
  latency: number[];
}

export interface StatsSnapshot {
  bots: Bot[];
  totalGuilds: number;
  totalMembers: number;
  onlineBots: number;
  onlineShards: number;
  totalShards: number;
  offlineShards: number;
  offlineBots: number;
  avgPing: number;
  allOnline: boolean;
  lastFetch: number | null;
  pingHistory: Map<string, number[]>;
  liveHistory: LiveHistory;
  loading: boolean;
}

function emptyHistory(): LiveHistory {
  return { clusters: [], shards: [], guilds: [], members: [], latency: [] };
}

function pushSeries(arr: number[], v: number) {
  arr.push(Number.isFinite(v) ? v : 0);
  if (arr.length > SPARK_MAX) arr.shift();
}

/** Seed all series from the server's hourly history (last 24 h). */
function seedFromHistory(rows: StatsResponse["history"], live: LiveHistory) {
  if (!rows || rows.length === 0) return;

  // Group by hour slot across all bot_labels
  const buckets = new Map<number, {
    guilds: number; members: number; shards: number; latency: number; latencyCount: number;
  }>();

  for (const row of rows) {
    const slot = Math.floor(new Date(row.timestamp).getTime() / (60 * 60 * 1000));
    const b = buckets.get(slot) || { guilds: 0, members: 0, shards: 0, latency: 0, latencyCount: 0 };
    b.guilds  += row.guild_count  || 0;
    b.members += row.member_count || 0;
    b.shards  += row.shard_count  || 0;
    if (row.avg_latency) { b.latency += row.avg_latency; b.latencyCount++; }
    buckets.set(slot, b);
  }

  const ordered = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-SPARK_MAX);

  if (live.guilds.length   === 0) live.guilds   = ordered.map(([, v]) => v.guilds);
  if (live.members.length  === 0) live.members  = ordered.map(([, v]) => v.members);
  if (live.shards.length   === 0) live.shards   = ordered.map(([, v]) => v.shards);
  if (live.latency.length  === 0) live.latency  = ordered.map(([, v]) =>
    v.latencyCount > 0 ? Math.round(v.latency / v.latencyCount) : 0
  );
  if (live.clusters.length === 0) live.clusters = ordered.map(() => 1);
}

export function useStats(intervalMs = 30_000): StatsSnapshot {
  const liveHistoryRef = useRef<LiveHistory>(emptyHistory());
  const pingHistoryRef = useRef<Map<string, number[]>>(new Map());
  const [snapshot, setSnapshot] = useState<StatsSnapshot>({
    bots: [],
    totalGuilds: 0,
    totalMembers: 0,
    onlineBots: 0,
    onlineShards: 0,
    totalShards: 0,
    offlineShards: 0,
    offlineBots: 0,
    avgPing: 0,
    allOnline: true,
    lastFetch: null,
    pingHistory: new Map(),
    liveHistory: emptyHistory(),
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const data = await apiGet<StatsResponse>("/api/stats");
        if (cancelled) return;

        const live = liveHistoryRef.current;
        seedFromHistory(data.history, live);

        const bots = data.current || [];
        const totalGuilds  = bots.reduce((s, b) => s + (b.guilds   || 0), 0);
        const totalMembers = bots.reduce((s, b) => s + (b.members  || 0), 0);
        const allShards    = bots.flatMap(b => (b.shards || []).map(s => ({ ...s, _bot: b.label })));
        const onlineShardsArr = allShards.filter(s => s.status === "Online");
        const onlineShards = onlineShardsArr.length;
        const totalShards  = allShards.length;
        const offlineShards = totalShards - onlineShards;
        const onlineBots   = bots.filter(b => b.online).length;
        const offlineBots  = bots.length - onlineBots;
        const avgPing = onlineShards > 0
          ? Math.round(onlineShardsArr.reduce((s, x) => s + (x.ping || 0), 0) / onlineShards)
          : 0;

        pushSeries(live.clusters, onlineBots);
        pushSeries(live.shards,   onlineShards);
        pushSeries(live.guilds,   totalGuilds);
        pushSeries(live.members,  totalMembers);
        pushSeries(live.latency,  avgPing);

        const ph = pingHistoryRef.current;
        for (const s of allShards) {
          const key = `${s._bot}-${s.shard_id}`;
          const arr = ph.get(key) || [];
          arr.push(s.status === "Online" ? (s.ping || 0) : 0);
          if (arr.length > SPARK_MAX) arr.shift();
          ph.set(key, arr);
        }

        setSnapshot({
          bots,
          totalGuilds,
          totalMembers,
          onlineBots,
          onlineShards,
          totalShards,
          offlineShards,
          offlineBots,
          avgPing,
          allOnline: offlineShards === 0 && offlineBots === 0,
          lastFetch: Date.now(),
          pingHistory: new Map(ph),
          liveHistory: { ...live },
          loading: false,
        });
      } catch {
        if (!cancelled) setSnapshot(s => ({ ...s, loading: false }));
      }
    };

    tick();
    const id = setInterval(tick, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [intervalMs]);

  return snapshot;
}
