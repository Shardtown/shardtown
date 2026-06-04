import { useEffect, useMemo, useRef, useState } from "react";
import type { Bot, StatsResponse } from "@/lib/types";
import { apiGet } from "@/api/client";

const SPARK_MAX = 24;

// Persiste l'historique en localStorage pour qu'on retrouve les barres
// quand on revient sur la page de statut. Sans ça, chaque visite repart
// avec 0 point, il faut rester 12 min sur la page pour remplir la jauge.
const STORAGE_KEY = "shardtown:stats:history:v1";
// Au-delà de 30 min, on considère que les barres sont trop périmées
// et on repart de zéro pour ne pas montrer un faux "tout va bien".
const STORAGE_TTL_MS = 30 * 60 * 1000;

export interface LiveHistory {
  clusters: number[];
  shards: number[];
  guilds: number[];
  members: number[];
  latency: number[];
}

interface StoredHistory {
  savedAt: number;
  live: LiveHistory;
  ping: [string, number[]][];
}

function loadStored(): StoredHistory | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredHistory;
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > STORAGE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStored(live: LiveHistory, ping: Map<string, number[]>) {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredHistory = {
      savedAt: Date.now(),
      live,
      ping: [...ping.entries()],
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota dépassé / mode privé : on continue en mémoire */
  }
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

function seedFromHistory(rows: StatsResponse["history"], live: LiveHistory) {
  if (!rows || rows.length === 0) return;
  const buckets = new Map<number, { guilds: number; members: number }>();
  for (const row of rows) {
    const slot = Math.floor(new Date(row.timestamp).getTime() / (60 * 60 * 1000));
    const b = buckets.get(slot) || { guilds: 0, members: 0 };
    b.guilds += row.guild_count || 0;
    b.members += row.member_count || 0;
    buckets.set(slot, b);
  }
  const ordered = [...buckets.entries()].sort((a, b) => a[0] - b[0]).slice(-SPARK_MAX);
  if (live.guilds.length === 0) live.guilds = ordered.map(([, v]) => v.guilds);
  if (live.members.length === 0) live.members = ordered.map(([, v]) => v.members);
}

export function useStats(intervalMs = 30_000): StatsSnapshot {
  // Init paresseuse via vars locales, éviter de lire `ref.current` dans le
  // corps du render (interdit par le compilateur React 19). Les Map/objets
  // sont par référence, donc le snapshot et les refs pointent vers la même
  // structure mutable, comme avant.
  // On hydrate depuis localStorage si dispo (TTL 30 min), sinon empty.
  const initialLive: LiveHistory = useMemo(() => {
    const stored = loadStored();
    return stored?.live ?? emptyHistory();
  }, []);
  const initialPing: Map<string, number[]> = useMemo(() => {
    const stored = loadStored();
    return new Map(stored?.ping ?? []);
  }, []);
  const liveHistoryRef = useRef<LiveHistory>(initialLive);
  const pingHistoryRef = useRef<Map<string, number[]>>(initialPing);
  const [snapshot, setSnapshot] = useState<StatsSnapshot>(() => ({
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
    pingHistory: initialPing,
    liveHistory: initialLive,
    loading: true,
  }));

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const data = await apiGet<StatsResponse>("/api/stats");
        if (cancelled) return;

        const live = liveHistoryRef.current;
        seedFromHistory(data.history, live);

        const bots = data.current || [];
        const totalGuilds = bots.reduce((s, b) => s + (b.guilds || 0), 0);
        const totalMembers = bots.reduce((s, b) => s + (b.members || 0), 0);
        const allShards = bots.flatMap(b => (b.shards || []).map(s => ({ ...s, _bot: b.label })));
        const onlineShardsArr = allShards.filter(s => s.status === "Online");
        const onlineShards = onlineShardsArr.length;
        const totalShards = allShards.length;
        const offlineShards = totalShards - onlineShards;
        const onlineBots = bots.filter(b => b.online).length;
        const offlineBots = bots.length - onlineBots;
        const avgPing = onlineShards > 0
          ? Math.round(onlineShardsArr.reduce((s, x) => s + (x.ping || 0), 0) / onlineShards)
          : 0;

        pushSeries(live.clusters, onlineBots);
        pushSeries(live.shards, onlineShards);
        pushSeries(live.guilds, totalGuilds);
        pushSeries(live.members, totalMembers);
        pushSeries(live.latency, avgPing);

        const ph = pingHistoryRef.current;
        for (const s of allShards) {
          const key = `${s._bot}-${s.shard_id}`;
          const arr = ph.get(key) || [];
          arr.push(s.status === "Online" ? (s.ping || 0) : 0);
          if (arr.length > SPARK_MAX) arr.shift();
          ph.set(key, arr);
        }

        saveStored(live, ph);

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
