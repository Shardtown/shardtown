import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { useAuth } from "@/api/auth";
import { IS_DESKTOP } from "@/lib/desktop";
import { notify } from "@/lib/notifications";

const SHOWN_KEY = "shardtown.greeting-shown";

function greetingFor(date: Date): { text: string; evening: boolean } {
  const h = date.getHours();
  const evening = h >= 18 || h < 5;
  return { text: evening ? "Bonsoir" : "Bonjour", evening };
}

/**
 * Fires once per app launch with a "Bonjour/Bonsoir, {name}" notification.
 * Prefers the native macOS Notification Center; only falls back to the
 * in-app slide-in toast when the user has refused the notifications
 * permission or muted the "greeting" category. Gated on IS_DESKTOP +
 * authenticated user. Dedup via sessionStorage so navigations or auth
 * refreshes inside the same launch don't retrigger.
 */
export function GreetingToast() {
  const { user, loading } = useAuth();
  const [phase, setPhase] = useState<"idle" | "in" | "out">("idle");
  const [greeting, setGreeting] = useState<{ text: string; evening: boolean } | null>(null);

  useEffect(() => {
    if (!IS_DESKTOP || loading || !user) return;
    try {
      if (sessionStorage.getItem(SHOWN_KEY)) return;
      sessionStorage.setItem(SHOWN_KEY, "1");
    } catch { /* sessionStorage may be unavailable — still show once */ }

    const g = greetingFor(new Date());
    const name = user.global_name || user.username || "ami";
    let cancelled = false;
    const timers: number[] = [];

    void notify({
      category: "greeting",
      title: `${g.text}, ${name}.`,
      body: "Heureux de te revoir sur Shardtown.",
    }).then(delivered => {
      // Native notification took it — no need to render the in-app card.
      if (cancelled || delivered) return;
      setGreeting(g);
      timers.push(window.setTimeout(() => setPhase("in"), 100));
      timers.push(window.setTimeout(() => setPhase("out"), 5000));
      timers.push(window.setTimeout(() => setPhase("idle"), 5400));
    });

    return () => {
      cancelled = true;
      for (const t of timers) window.clearTimeout(t);
    };
  }, [user, loading]);

  if (phase === "idle" || !greeting) return null;
  const name = user?.global_name || user?.username || "ami";

  return (
    <div
      className={`fixed top-5 right-5 z-[140] pointer-events-none greeting-toast ${phase}`}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={() => setPhase("out")}
        className="ds-glass pointer-events-auto rounded-[14px] border pl-3 pr-4 py-2.5 flex items-center gap-3 min-w-[260px] max-w-[340px] text-left transition-transform hover:scale-[1.015] active:scale-[0.99]"
        style={{
          borderColor: "var(--ds-border-strong)",
          boxShadow: "0 18px 50px rgba(0, 0, 0, 0.45)",
        }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background: "var(--ds-panel-2)",
            color: "var(--ds-text)",
            border: "1px solid var(--ds-border)",
          }}
        >
          {greeting.evening
            ? <Moon size={16} strokeWidth={2} />
            : <Sun size={16} strokeWidth={2} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-extrabold tracking-tight leading-tight">
            {greeting.text}, {name}.
          </p>
          <p
            className="text-[11.5px] font-semibold mt-0.5 truncate"
            style={{ color: "var(--ds-text-mut)" }}
          >
            Heureux de te revoir sur Shardtown.
          </p>
        </div>
      </button>
      <style>{`
        .greeting-toast.in  { animation: greet-in  380ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .greeting-toast.out { animation: greet-out 280ms cubic-bezier(0.4, 0, 1, 1) both; }
        @keyframes greet-in {
          from { opacity: 0; transform: translateY(-12px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)     scale(1); }
        }
        @keyframes greet-out {
          from { opacity: 1; transform: translateY(0)    scale(1); }
          to   { opacity: 0; transform: translateY(-8px) scale(0.97); }
        }
      `}</style>
    </div>
  );
}
