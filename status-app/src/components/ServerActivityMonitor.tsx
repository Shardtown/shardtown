import { useEffect, useRef } from "react";
import { apiGet } from "@/api/client";
import { notify } from "@/lib/notifications";
import { IS_DESKTOP } from "@/lib/desktop";

const POLL_INTERVAL_MS = 90_000;
const STORAGE_KEY = "shardtown.notifications.last-seen";

interface ActivityEvent {
  id: string;
  type: "giveaway" | "poll";
  title: string;
  guildId: string;
  guildName: string;
  timestamp: number;
}

interface RecentResponse {
  events: ActivityEvent[];
}

function readLastSeen(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    const n = v ? Number.parseInt(v, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch { return 0; }
}

function writeLastSeen(ts: number): void {
  try { localStorage.setItem(STORAGE_KEY, String(ts)); } catch { /* */ }
}

/**
 * Polls `/api/notifications/recent` and fires a native notification for
 * each newly-ended giveaway or poll on the user's admin guilds. Uses a
 * cursor in localStorage so each event triggers exactly once across app
 * launches.
 *
 * Mounted at the App level inside PersistentOverlays. Desktop-only.
 */
export function ServerActivityMonitor() {
  const cursor = useRef<number>(readLastSeen());

  useEffect(() => {
    if (!IS_DESKTOP) return;
    let cancelled = false;
    let timer: number | null = null;

    async function tick() {
      try {
        const data = await apiGet<RecentResponse>(
          `/api/notifications/recent?since=${cursor.current}`,
        );
        if (cancelled) return;

        // Server sorts DESC; iterate ASC so notifications surface oldest
        // first — matches the order the events actually happened in.
        const events = (data.events || []).slice().sort((a, b) => a.timestamp - b.timestamp);
        for (const ev of events) {
          if (ev.timestamp <= cursor.current) continue;
          const verb = ev.type === "giveaway" ? "Giveaway terminé" : "Sondage clôturé";
          void notify({
            category: "server-activity",
            title: `${verb} · ${ev.guildName}`,
            body: ev.title.length > 120 ? ev.title.slice(0, 117) + "…" : ev.title,
          });
          cursor.current = ev.timestamp;
        }
        writeLastSeen(cursor.current);
      } catch {
        // Auth lost / network blip — re-try next interval.
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(tick, POLL_INTERVAL_MS);
        }
      }
    }

    tick();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return null;
}
