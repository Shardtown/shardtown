import { useEffect, useRef, useState } from "react";
import { CheckCircle2, X, AlertTriangle } from "lucide-react";
import { apiGet } from "@/api/client";
import { notify } from "@/lib/notifications";

const STORAGE_KEY = "shardtown.verify-job.active";
const POLL_INTERVAL_MS = 6000;

interface ActiveJob {
  guildId: string;
  startedAt: number;
}

interface JobStatus {
  exists: boolean;
  running?: boolean;
  granted?: number;
  skipped?: number;
  doneAt?: number | null;
  error?: string | null;
}

type Notif = {
  kind: "success";
  granted: number;
  skipped: number;
} | {
  kind: "error";
  message: string;
};

/**
 * Polls the verify-all background job endpoint while an active job is
 * persisted in localStorage, then surfaces a toast in the bottom-right
 * of the desktop app when it completes.
 *
 * Mounted once at the App level (PersistentOverlays) so it keeps polling
 * even when the user navigates around the dashboard during the run.
 */
export function VerifyAllNotifier() {
  const [notif, setNotif] = useState<Notif | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    function readJob(): ActiveJob | null {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed?.guildId !== "string") return null;
        return parsed;
      } catch { return null; }
    }
    function clearJob() {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
    }

    async function tick() {
      if (cancelled) return;
      const job = readJob();
      if (!job) return;

      try {
        const status = await apiGet<JobStatus>(
          `/shard/mod/api/guild/${job.guildId}/verify-all/status`,
        );
        if (cancelled) return;
        if (!status.exists) {
          // Server forgot, treat as completed with what we have.
          clearJob();
          return;
        }
        if (status.running) {
          // Still working, re-poll later.
          timerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
          return;
        }
        // Done. Surface the result and clear the flag. Prefer the macOS
        // Notification Center; only fall back to the in-app toast when the
        // user refused permissions or muted the category.
        clearJob();
        if (status.error) {
          const errMsg = status.error;
          notify({
            category: "long-actions",
            title: "Vérification échouée",
            body: errMsg,
          }).then(delivered => {
            if (cancelled || delivered) return;
            setNotif({ kind: "error", message: errMsg });
          });
        } else {
          const granted = status.granted ?? 0;
          const skipped = status.skipped ?? 0;
          notify({
            category: "long-actions",
            title: "Vérification terminée",
            body: `${granted} rôle${granted > 1 ? "s" : ""} attribué${granted > 1 ? "s" : ""}${skipped > 0 ? ` · ${skipped} ignoré${skipped > 1 ? "s" : ""}` : ""}.`,
          }).then(delivered => {
            if (cancelled || delivered) return;
            setNotif({ kind: "success", granted, skipped });
          });
          // Ask the active Guild page to re-fetch stats so the verified
          // counter, % and non-verified counts catch up.
          window.dispatchEvent(new Event("shardtown:guild-refresh"));
        }
      } catch {
        // Network blip, retry next interval.
        timerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
      }
    }

    // First poll a beat after mount + whenever a new job is launched
    // from a panel elsewhere in the app.
    function start() {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(tick, 1500);
    }
    start();
    window.addEventListener("shardtown:verify-job-started", start);

    return () => {
      cancelled = true;
      window.removeEventListener("shardtown:verify-job-started", start);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  // Auto-dismiss after 12s.
  useEffect(() => {
    if (!notif) return;
    const id = window.setTimeout(() => setNotif(null), 12000);
    return () => window.clearTimeout(id);
  }, [notif]);

  if (!notif) return null;

  const isError = notif.kind === "error";
  const accent = isError ? "var(--ds-status-err)" : "var(--ds-status-ok)";
  const accentBg = isError ? "rgba(239, 68, 68, 0.12)" : "rgba(var(--ds-status-ok-rgb), 0.12)";
  const accentBorder = isError ? "rgba(239, 68, 68, 0.32)" : "rgba(var(--ds-status-ok-rgb), 0.32)";

  return (
    <div
      className="ds-glass fixed z-[400] bottom-6 right-6 w-[340px] rounded-[16px] border overflow-hidden verify-notifier"
      style={{ borderColor: "var(--ds-border-strong)" }}
      role="status"
      aria-live="polite"
    >
      <div className="h-[3px] w-full" style={{ background: accent }} />
      <button
        type="button"
        onClick={() => setNotif(null)}
        aria-label="Fermer"
        className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--ds-panel-2)]"
        style={{ background: "var(--ds-panel)", color: "var(--ds-text-mut)" }}
      >
        <X size={11} strokeWidth={2.4} />
      </button>
      <div className="px-5 py-4">
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
            style={{ background: accentBg, border: `1px solid ${accentBorder}`, color: accent }}
          >
            {isError ? <AlertTriangle size={15} strokeWidth={2} /> : <CheckCircle2 size={15} strokeWidth={2} />}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-[10px] font-bold tracking-[0.22em] uppercase"
              style={{ color: accent }}
            >
              {isError ? "Vérification échouée" : "Vérification terminée"}
            </p>
            <p className="text-[13.5px] font-bold leading-tight mt-0.5">
              {isError
                ? "Le serveur a renvoyé une erreur."
                : `${notif.granted} rôle${notif.granted > 1 ? "s" : ""} attribué${notif.granted > 1 ? "s" : ""}.`}
            </p>
          </div>
        </div>
        <p className="text-[11.5px] leading-relaxed pl-12 pr-2" style={{ color: "var(--ds-text-mut)" }}>
          {isError
            ? notif.message
            : notif.skipped > 0
              ? `${notif.skipped} membre${notif.skipped > 1 ? "s" : ""} ignoré${notif.skipped > 1 ? "s" : ""} (déjà vérifié ou bot).`
              : "Tous les membres éligibles ont reçu le rôle."}
        </p>
      </div>

      <style>{`
        .verify-notifier {
          animation: verify-notif-in 280ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes verify-notif-in {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
