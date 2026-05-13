import { useEffect, useRef } from "react";
import { apiGet } from "@/api/client";
import { notify } from "@/lib/notifications";
import { IS_DESKTOP } from "@/lib/desktop";
import type { StatsResponse } from "@/lib/types";

const POLL_INTERVAL_MS = 60_000;

/**
 * Polls `/api/stats` once a minute and fires a native notification whenever
 * a bot transitions between online and offline. Only the *transition* is
 * surfaced — we never fire on the first tick (no prior state to compare
 * against) and we never re-notify for a state that already matches the
 * last observation.
 *
 * Mounted at the App level inside PersistentOverlays so it keeps watching
 * regardless of the current route. Desktop-only — the hook short-circuits
 * on web.
 */
export function BotStateMonitor() {
  const lastState = useRef<Map<string, boolean> | null>(null);

  useEffect(() => {
    if (!IS_DESKTOP) return;
    let cancelled = false;
    let timer: number | null = null;

    async function tick() {
      try {
        const data = await apiGet<StatsResponse>("/api/stats");
        if (cancelled) return;

        const current = new Map<string, boolean>();
        for (const bot of data.current || []) {
          current.set(bot.label, !!bot.online);
        }

        const prev = lastState.current;
        if (prev) {
          for (const [label, online] of current) {
            const wasOnline = prev.get(label);
            if (wasOnline === undefined) continue;
            if (wasOnline === online) continue;
            if (online) {
              void notify({
                category: "bot-state",
                title: `${label} de retour en ligne`,
                body: "Le bot répond à nouveau.",
              });
            } else {
              void notify({
                category: "bot-state",
                title: `${label} hors-ligne`,
                body: "Le bot ne répond plus — vérifie le statut.",
              });
            }
          }
        }
        lastState.current = current;
      } catch {
        // Network blip / auth lost — keep watching, next tick may succeed.
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
