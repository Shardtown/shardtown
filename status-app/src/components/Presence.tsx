import {
  createContext, useContext, useEffect, useState, type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, X as XIcon } from "lucide-react";
import {
  usePresence, presenceColor, peerAvatarUrl, type Peer,
} from "@/hooks/usePresence";

/* ─── Context ─────────────────────────────────────────────────────── */

interface Ctx {
  peers: Peer[];
  followTargetId: string | null;
  setFollowTargetId: (id: string | null) => void;
}
const PresenceCtx = createContext<Ctx>({
  peers: [],
  followTargetId: null,
  setFollowTargetId: () => {},
});

/**
 * Owns the presence subscription for the current route + the
 * "follow this admin" state. Mount once, inside the router tree
 * (DesktopShell). Scope = `guild:<id>` on guild-detail routes; null
 * elsewhere so personal pages don't leak presence between strangers.
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const nav = useNavigate();
  const scope = scopeForPath(loc.pathname);
  const [followTargetId, setFollowTargetId] = useState<string | null>(null);

  // Fast mode (cursors + 1.5 s heartbeat) is on when peers are visible
  // OR a follow session is active. We don't know peer count yet, so we
  // bias to "on" as soon as we're in a guild scope, better demo, and
  // it stops automatically when the scope becomes null.
  const fast = scope !== null;
  const { peers } = usePresence({ scope, path: loc.pathname, fast });

  // Auto-stop follow if target leaves the scope (closed tab, navigated
  // to a non-guild page, etc.).
  useEffect(() => {
    if (!followTargetId) return;
    if (!peers.find(p => p.id === followTargetId)) setFollowTargetId(null);
  }, [peers, followTargetId]);

  // Mirror the follow target's path. Ignore peers that don't broadcast
  // a path yet (first heartbeat may not have landed).
  useEffect(() => {
    if (!followTargetId) return;
    const t = peers.find(p => p.id === followTargetId);
    if (t?.path && t.path !== loc.pathname) {
      nav(t.path);
    }
  }, [followTargetId, peers, loc.pathname, nav]);

  return (
    <PresenceCtx.Provider value={{ peers, followTargetId, setFollowTargetId }}>
      {children}
    </PresenceCtx.Provider>
  );
}

function usePresenceCtx() { return useContext(PresenceCtx); }

function scopeForPath(pathname: string): string | null {
  const m = /^\/shard\/guild\/([\w-]+)/.exec(pathname);
  if (m) return `guild:${m[1]}`;
  return null;
}

/* ─── Top-right avatar stack ──────────────────────────────────────── */

export function PresenceStack() {
  const { peers, followTargetId, setFollowTargetId } = usePresenceCtx();
  if (peers.length === 0) return null;
  const visible = peers.slice(0, 5);
  const extra = peers.length - visible.length;
  return (
    <div className="flex items-center -space-x-2 mr-1.5">
      {visible.map(p => (
        <PeerChip
          key={p.id}
          peer={p}
          following={followTargetId === p.id}
          onToggleFollow={() =>
            setFollowTargetId(followTargetId === p.id ? null : p.id)
          }
        />
      ))}
      {extra > 0 && (
        <div
          className="relative w-8 h-8 rounded-full flex items-center justify-center text-[10.5px] font-extrabold border-2 z-0"
          style={{
            background: "var(--ds-panel)",
            color: "var(--ds-text-mut)",
            borderColor: "var(--ds-bg-1)",
          }}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}

function PeerChip({
  peer, following, onToggleFollow,
}: {
  peer: Peer;
  following: boolean;
  onToggleFollow: () => void;
}) {
  const [hover, setHover] = useState(false);
  const name = peer.global_name || peer.username || "Admin";
  const ring = presenceColor(peer.id);
  const writing = !!peer.field;
  return (
    <button
      type="button"
      onClick={onToggleFollow}
      title={following ? `Arrêter de suivre ${name}` : `Suivre ${name}`}
      className="relative transition-transform hover:z-20 hover:scale-110"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className="w-8 h-8 rounded-full overflow-hidden border-2"
        style={{
          borderColor: ring,
          background: "var(--ds-panel-2)",
          boxShadow: following
            ? `0 0 0 2px var(--ds-bg-1), 0 0 0 4px ${ring}, 0 0 14px ${ring}88`
            : writing ? `0 0 12px ${ring}55` : "none",
        }}
      >
        <img
          src={peerAvatarUrl(peer, 64)}
          alt={name}
          className="w-full h-full object-cover"
        />
      </div>
      {writing && (
        <span
          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full presence-typing"
          style={{ background: ring, boxShadow: `0 0 6px ${ring}` }}
        />
      )}
      {following && (
        <span
          className="absolute -top-1 -left-1 w-4 h-4 rounded-full flex items-center justify-center"
          style={{ background: ring, color: "#fff" }}
        >
          <Eye size={9} strokeWidth={2.8} />
        </span>
      )}
      {hover && (
        <div
          className="absolute top-full mt-2 right-0 px-2.5 py-1.5 rounded-md border whitespace-nowrap text-[11px] font-semibold pointer-events-none z-50"
          style={{
            background: "var(--ds-bg-1)",
            borderColor: "var(--ds-border-strong)",
            color: "var(--ds-text)",
            boxShadow: "0 10px 30px -10px rgba(0,0,0,0.5)",
          }}
        >
          {name}
          {writing && (
            <span style={{ color: "var(--ds-text-mut)", marginLeft: 6 }}>
              · {fieldLabel(peer.field!)}
            </span>
          )}
          <span className="block text-[10px] font-medium mt-0.5" style={{ color: "var(--ds-text-dim)" }}>
            {following ? "Tu suis cet admin · clic pour arrêter" : "Clic pour suivre sa navigation"}
          </span>
        </div>
      )}
      <style>{`
        .presence-typing {
          animation: presence-typing-pulse 1.4s ease-in-out infinite;
        }
        @keyframes presence-typing-pulse {
          0%, 100% { transform: scale(0.85); opacity: 0.8; }
          50%      { transform: scale(1.05); opacity: 1; }
        }
      `}</style>
    </button>
  );
}

function fieldLabel(key: string): string {
  if (key === "__field__") return "écrit quelque chose";
  const human = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
  return `écrit dans « ${human} »`;
}

/* ─── Follow banner ───────────────────────────────────────────────── */

export function FollowBanner() {
  const { peers, followTargetId, setFollowTargetId } = usePresenceCtx();
  if (!followTargetId) return null;
  const target = peers.find(p => p.id === followTargetId);
  if (!target) return null;
  const name = target.global_name || target.username || "Admin";
  const ring = presenceColor(target.id);
  return (
    <div
      className="fixed top-2.5 left-1/2 -translate-x-1/2 z-[110] follow-banner pointer-events-auto"
      role="status"
    >
      <div
        className="ds-glass flex items-center gap-2.5 pl-2 pr-1.5 py-1.5 rounded-full border"
        style={{
          borderColor: "var(--ds-border-strong)",
          boxShadow: `0 12px 40px -10px ${ring}66, 0 6px 20px rgba(0,0,0,0.4)`,
        }}
      >
        <img
          src={peerAvatarUrl(target, 48)}
          alt=""
          className="w-6 h-6 rounded-full border-2"
          style={{ borderColor: ring }}
        />
        <span className="text-[11.5px] font-bold leading-tight">
          Tu suis <span style={{ color: ring }}>{name}</span>
        </span>
        <button
          type="button"
          onClick={() => setFollowTargetId(null)}
          className="ml-1 w-6 h-6 rounded-full flex items-center justify-center transition-opacity hover:opacity-80"
          style={{ background: "var(--ds-panel-2)", color: "var(--ds-text-mut)" }}
          aria-label="Arrêter de suivre"
          title="Arrêter de suivre"
        >
          <XIcon size={10} strokeWidth={2.6} />
        </button>
      </div>
      <style>{`
        .follow-banner {
          animation: follow-banner-in 280ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes follow-banner-in {
          from { opacity: 0; transform: translate(-50%, -10px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}

/* ─── Field overlay layer, locks + chips combined ────────────────── */

/**
 * For each peer with a focused field, renders:
 *   1. A gray overlay covering the input (visual "Killer modifie" lock)
 *   2. A small avatar pinned to the input's top-right corner
 *
 * Positions are recomputed at ~8 Hz to follow scroll, resize and CSS
 * transitions without flicker.
 */
export function FieldPresenceLayer() {
  const { peers } = usePresenceCtx();
  const editing = peers.filter(p => p.field && p.field !== "__field__");
  const [, force] = useState(0);
  useEffect(() => {
    if (editing.length === 0) return;
    const t = window.setInterval(() => force(n => n + 1), 125);
    return () => clearInterval(t);
  }, [editing.length]);
  if (editing.length === 0) return null;
  return (
    <>
      {editing.map(p => <FieldOverlay key={p.id} peer={p} field={p.field!} />)}
    </>
  );
}

function FieldOverlay({ peer, field }: { peer: Peer; field: string }) {
  const el = findFieldEl(field);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const ring = presenceColor(peer.id);
  const name = peer.global_name || peer.username || "Admin";
  return (
    <>
      {/* Lock overlay over the input itself */}
      <div
        className="fixed pointer-events-auto z-[100] field-lock"
        style={{
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
          borderRadius: getComputedStyle(el).borderRadius || 8,
          background: "rgba(20, 20, 28, 0.55)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          border: `1.5px solid ${ring}`,
          boxShadow: `0 0 0 1px ${ring}22, inset 0 0 0 1px rgba(255,255,255,0.04)`,
          cursor: "not-allowed",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-hidden
      >
        <span
          className="px-2 py-0.5 rounded-full text-[10.5px] font-bold whitespace-nowrap"
          style={{
            background: ring,
            color: "#fff",
            boxShadow: `0 4px 14px ${ring}66`,
          }}
        >
          {name} modifie…
        </span>
      </div>
      {/* Small avatar chip at the input's top-right corner */}
      <div
        className="fixed pointer-events-none z-[120] field-chip"
        style={{ top: Math.max(8, r.top - 12), left: Math.max(8, r.right - 22) }}
        aria-hidden
      >
        <img
          src={peerAvatarUrl(peer, 64)}
          alt=""
          className="w-7 h-7 rounded-full object-cover border-2"
          style={{ borderColor: ring, background: "var(--ds-panel)" }}
        />
      </div>
      <style>{`
        .field-lock { animation: field-lock-in 220ms cubic-bezier(0.22, 1, 0.36, 1); }
        .field-chip { animation: field-chip-in 220ms cubic-bezier(0.22, 1, 0.36, 1); }
        @keyframes field-lock-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes field-chip-in {
          from { opacity: 0; transform: translateY(-4px) scale(0.9); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}

function findFieldEl(field: string): HTMLElement | null {
  if (!field) return null;
  const esc = (typeof CSS !== "undefined" && CSS.escape) ? CSS.escape(field) : field;
  const tries = [
    `[data-presence-field="${esc}"]`,
    `input[name="${esc}"]`,
    `textarea[name="${esc}"]`,
    `#${esc}`,
  ];
  for (const sel of tries) {
    try {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el) return el;
    } catch { /* */ }
  }
  return null;
}

/* ─── Ghost cursors (Figma-style live cursor following) ───────────── */

/**
 * Renders an SVG cursor pointer at each peer's current mouse position
 * (% of viewport). CSS transition smooths the jump between polls so
 * the cursor glides instead of teleporting.
 */
export function GhostCursors() {
  const { peers } = usePresenceCtx();
  const withCursors = peers.filter(p => p.cursor);
  if (withCursors.length === 0) return null;
  return (
    <div className="fixed inset-0 pointer-events-none z-[130]" aria-hidden>
      {withCursors.map(p => <GhostCursor key={p.id} peer={p} />)}
    </div>
  );
}

function GhostCursor({ peer }: { peer: Peer }) {
  const ring = presenceColor(peer.id);
  const name = peer.global_name || peer.username || "Admin";
  const c = peer.cursor!;
  const w = typeof window !== "undefined" ? window.innerWidth : 1200;
  const h = typeof window !== "undefined" ? window.innerHeight : 800;
  const x = (c.x / 100) * w;
  const y = (c.y / 100) * h;
  return (
    <div
      className="absolute top-0 left-0 ghost-cursor"
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      {/* SVG cursor arrow tinted with the peer's color */}
      <svg width="20" height="22" viewBox="0 0 20 22" style={{ filter: `drop-shadow(0 2px 4px ${ring}88)` }}>
        <path
          d="M3 2 L17 11 L11 12.5 L13.5 18 L11 19 L8.5 13.5 L3 16 Z"
          fill={ring}
          stroke="#fff"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="absolute left-4 top-4 px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap"
        style={{ background: ring, color: "#fff" }}
      >
        {name}
      </span>
      <style>{`
        .ghost-cursor {
          transition: transform 1.4s cubic-bezier(0.22, 1, 0.36, 1);
          will-change: transform;
        }
      `}</style>
    </div>
  );
}
