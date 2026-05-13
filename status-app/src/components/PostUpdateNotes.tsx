import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { IS_DESKTOP } from "@/lib/desktop";
import { notify } from "@/lib/notifications";

const SEEN_KEY = "shardtown.last-seen-version.v1";
const MANIFEST_URL = "https://shardtwn.fr/updates/latest.json";

interface Manifest {
  version?: string;
  pub_date?: string;
  notes?: string;
}

/**
 * After every update + relaunch, surfaces a brief "what's new" modal :
 *   - On first launch we just store the current version and skip the modal.
 *   - On every subsequent launch where the current version differs from
 *     what we last saw, fetch the public manifest and show its notes.
 *
 * Notes intentionally come from latest.json (= what the public site
 * advertises) so we don't have to bundle a changelog inside the app.
 * If the manifest fetch fails we still acknowledge the version bump
 * silently — no annoying error popup.
 */
export function PostUpdateNotes() {
  const [info, setInfo] = useState<{ version: string; notes: string } | null>(null);

  useEffect(() => {
    if (!IS_DESKTOP) return;
    let cancelled = false;

    (async () => {
      // Fetch the running app's version through Tauri's runtime API.
      let current: string;
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        current = await getVersion();
      } catch {
        return;
      }
      if (!current || cancelled) return;

      // First install — establish the baseline and bail.
      const seen = readSeen();
      if (!seen) {
        writeSeen(current);
        return;
      }
      // No change → nothing to do.
      if (seen === current) return;

      // Version moved. Persist the new pointer immediately so the modal
      // can't pop again if the user re-opens the app without dismissing.
      writeSeen(current);

      try {
        const r = await fetch(MANIFEST_URL, { cache: "no-cache" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const m: Manifest = await r.json();
        const notes = (m.notes || "").trim();
        if (cancelled || !notes) return;

        // Prefer the macOS Notification Center. The native banner can't
        // render the full markdown changelog so we surface the first
        // non-empty line as the body (capped at 200 chars) and trust the
        // user to open the app to read the rest.
        const firstLine = notes.split(/\r?\n/).find(l => l.trim()) ?? notes;
        const body = firstLine.length > 200 ? firstLine.slice(0, 197) + "…" : firstLine;
        const delivered = await notify({
          category: "updates",
          title: `Shardtown mis à jour vers v${current}`,
          body,
        });
        if (cancelled || delivered) return;

        // User refused permissions or muted the "updates" category — fall
        // back to the in-app modal that shows the full notes.
        setInfo({ version: current, notes });
      } catch {
        // Network unavailable / manifest missing — silent acknowledge.
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (!info) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-6"
      onClick={() => setInfo(null)}
    >
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0, 0, 0, 0.55)", backdropFilter: "blur(10px)" }}
      />
      <div
        className="ds-glass relative w-full max-w-md rounded-[18px] border p-6 post-update-pop"
        style={{ borderColor: "var(--ds-border-strong)" }}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setInfo(null)}
          aria-label="Fermer"
          className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--ds-panel-2)]"
          style={{ background: "var(--ds-panel)", color: "var(--ds-text-mut)" }}
        >
          <X size={12} strokeWidth={2.2} />
        </button>

        <div
          className="inline-flex items-center justify-center w-10 h-10 rounded-[12px] mb-3"
          style={{
            background: "rgba(var(--ds-accent-rgb), 0.14)",
            border: "1px solid rgba(var(--ds-accent-rgb), 0.3)",
            color: "rgb(165, 180, 252)",
          }}
        >
          <Sparkles size={18} strokeWidth={1.8} />
        </div>

        <p
          className="text-[10px] font-bold tracking-[0.22em] uppercase mb-1"
          style={{ color: "rgb(165, 180, 252)" }}
        >
          Mise à jour installée
        </p>
        <h3 className="text-[18px] font-extrabold tracking-tight mb-2">
          Shardtown <span className="font-mono-num">v{info.version}</span>
        </h3>

        <div
          className="rounded-[10px] border px-4 py-3 mb-5 max-h-[260px] overflow-y-auto text-[12.5px] leading-relaxed whitespace-pre-line"
          style={{
            background: "var(--ds-bg-2)",
            borderColor: "var(--ds-border)",
            color: "var(--ds-text-mut)",
          }}
        >
          {info.notes}
        </div>

        <button
          type="button"
          onClick={() => setInfo(null)}
          className="w-full h-10 rounded-full text-[13px] font-bold transition-opacity hover:opacity-90"
          style={{ background: "var(--ds-accent)", color: "#fff" }}
        >
          Compris
        </button>

        <style>{`
          .post-update-pop {
            animation: post-pop 220ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          @keyframes post-pop {
            from { opacity: 0; transform: scale(0.94) translateY(8px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
}

function readSeen(): string | null {
  try {
    const v = localStorage.getItem(SEEN_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch { return null; }
}

function writeSeen(v: string) {
  try { localStorage.setItem(SEEN_KEY, v); } catch { /* */ }
}
