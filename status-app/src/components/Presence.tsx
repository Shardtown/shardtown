import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import {
  usePresence, presenceColor, peerAvatarUrl, type Peer,
} from "@/hooks/usePresence";

/* ─── Context ─────────────────────────────────────────────────────── */

interface Ctx { peers: Peer[]; }
const PresenceCtx = createContext<Ctx>({ peers: [] });

/**
 * Owns the presence subscription for the current route. Mount once,
 * inside the router tree (DesktopShell). Children consume via
 * `usePresencePeers()` so the hook only runs once per page.
 *
 * Scope = `guild:<id>` on guild-detail routes (the only places where
 * multiple admins legitimately share a screen). Personal pages
 * (/account, /preferences, /outils, …) intentionally disable presence:
 * the user shouldn't bump into strangers on routes that are
 * per-account.
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const scope = scopeForPath(loc.pathname);
  const { peers } = usePresence(scope);
  return (
    <PresenceCtx.Provider value={{ peers }}>{children}</PresenceCtx.Provider>
  );
}

function scopeForPath(pathname: string): string | null {
  const m = /^\/(shard|shardguard)\/guild\/([\w-]+)/.exec(pathname);
  if (m) return `guild:${m[2]}`;
  return null;
}

export function usePresencePeers(): Peer[] {
  return useContext(PresenceCtx).peers;
}

/* ─── Top-right avatar stack ──────────────────────────────────────── */

/**
 * Canva-style stacked avatars: small overlapping circles, ring colored
 * per user, hover tooltip with name + field-being-edited if any.
 * Renders nothing when alone on a page.
 */
export function PresenceStack() {
  const peers = usePresencePeers();
  if (peers.length === 0) return null;
  const visible = peers.slice(0, 5);
  const extra = peers.length - visible.length;
  return (
    <div className="flex items-center -space-x-2 mr-1.5">
      {visible.map(p => <PeerChip key={p.id} peer={p} />)}
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

function PeerChip({ peer }: { peer: Peer }) {
  const [hover, setHover] = useState(false);
  const name = peer.global_name || peer.username || "Admin";
  const ring = presenceColor(peer.id);
  const writing = !!peer.field;
  return (
    <div
      className="relative transition-transform hover:z-20 hover:scale-110"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className="w-8 h-8 rounded-full overflow-hidden border-2"
        style={{
          borderColor: ring,
          background: "var(--ds-panel-2)",
          boxShadow: writing ? `0 0 12px ${ring}55` : "none",
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
    </div>
  );
}

function fieldLabel(key: string): string {
  if (key === "__field__") return "écrit quelque chose";
  // Humanize: snake_case / kebab-case / camelCase → spaced + lowercased
  const human = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
  return `écrit dans « ${human} »`;
}

/* ─── Floating field-edit avatars (Canva live cursor analog) ──────── */

/**
 * For each peer currently focused on an input, render a small avatar
 * pinned to the top-right corner of that input. The avatar tracks the
 * input's bounding rect across layout changes.
 */
export function FieldPresenceLayer() {
  const peers = usePresencePeers();
  const editing = peers.filter(p => p.field && p.field !== "__field__");
  // Tick the layer so positions stay current under scroll / resize /
  // CSS transitions. 8 Hz is plenty smooth and stays cheap.
  const [, force] = useState(0);
  useEffect(() => {
    if (editing.length === 0) return;
    const t = window.setInterval(() => force(n => n + 1), 125);
    return () => clearInterval(t);
  }, [editing.length]);

  if (editing.length === 0) return null;
  return (
    <>
      {editing.map(p => (
        <FieldChip key={p.id} peer={p} field={p.field!} />
      ))}
    </>
  );
}

function FieldChip({ peer, field }: { peer: Peer; field: string }) {
  const el = findFieldEl(field);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // Pin to the top-right inner corner of the input.
  const top = Math.max(8, r.top - 12);
  const left = Math.max(8, r.right - 22);
  const ring = presenceColor(peer.id);
  const name = peer.global_name || peer.username || "Admin";
  return (
    <div
      className="fixed pointer-events-none z-[120] field-chip"
      style={{ top, left }}
      aria-hidden
    >
      <div className="relative">
        <img
          src={peerAvatarUrl(peer, 64)}
          alt=""
          className="w-7 h-7 rounded-full object-cover border-2"
          style={{ borderColor: ring, background: "var(--ds-panel)" }}
        />
        <div
          className="absolute left-full top-1/2 -translate-y-1/2 ml-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-bold whitespace-nowrap"
          style={{ background: ring, color: "#fff" }}
        >
          {name}
        </div>
      </div>
      <style>{`
        .field-chip { animation: field-chip-in 220ms cubic-bezier(0.22, 1, 0.36, 1); }
        @keyframes field-chip-in {
          from { opacity: 0; transform: translateY(-4px) scale(0.9); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

/**
 * Locate the DOM element a peer is editing. Order matches the hook's
 * lookup priority: explicit attribute, name, id. CSS.escape so weird
 * field names don't blow up the selector.
 */
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
    } catch { /* invalid selector — skip */ }
  }
  return null;
}
