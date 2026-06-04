import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/api/auth";
import { apiGet, apiPost } from "@/api/client";

export interface PeerCursor { x: number; y: number; }
export interface Peer {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  field?: string | null;
  path?: string | null;
  cursor?: PeerCursor | null;
}

const SLOW_HEARTBEAT_MS = 8000;
const SLOW_POLL_MS = 6000;
const FAST_HEARTBEAT_MS = 1500;
const FAST_POLL_MS = 1500;

interface Options {
  scope: string | null;
  /** Current SPA path, broadcast so peers can "follow" this user. */
  path?: string | null;
  /** When true, polling/heartbeat run at the fast cadence (~1.5 s) and
   *  cursor coordinates are broadcast. Caller sets this when peers are
   *  visible or a follow session is active. */
  fast?: boolean;
}

/**
 * Subscribes the current user to a presence "scope" (typically
 * `guild:<id>`). Sends heartbeats while mounted, polls peers, tracks
 * the focused input as `field`, the SPA route as `path`, and (in fast
 * mode) the mouse position as `cursor` for live ghost cursors.
 */
export function usePresence({ scope, path, fast }: Options) {
  const { user } = useAuth();
  const [peers, setPeers] = useState<Peer[]>([]);
  const fieldRef = useRef<string | null>(null);
  const cursorRef = useRef<PeerCursor | null>(null);
  const lastSentCursorRef = useRef<PeerCursor | null>(null);

  useEffect(() => {
    if (!scope || !user) { setPeers([]); return; }
    let cancelled = false;

    function beat() {
      // Only attach cursor in fast mode and when the mouse has moved
      // since the last broadcast (saves bandwidth + privacy in idle).
      let cursor: PeerCursor | null = null;
      if (fast && cursorRef.current) {
        const c = cursorRef.current;
        const prev = lastSentCursorRef.current;
        if (!prev || Math.abs(prev.x - c.x) > 0.2 || Math.abs(prev.y - c.y) > 0.2) {
          cursor = { x: c.x, y: c.y };
          lastSentCursorRef.current = cursor;
        }
      }
      apiPost("/api/presence/heartbeat", {
        scope,
        field: fieldRef.current,
        path: path || null,
        cursor,
      }).catch(() => { /* silent */ });
    }
    function poll() {
      apiGet<{ peers: Peer[] }>(`/api/presence?scope=${encodeURIComponent(scope!)}`)
        .then(r => { if (!cancelled) setPeers(r.peers || []); })
        .catch(() => { /* silent */ });
    }

    beat(); poll();
    const heartMs = fast ? FAST_HEARTBEAT_MS : SLOW_HEARTBEAT_MS;
    const pollMs = fast ? FAST_POLL_MS : SLOW_POLL_MS;
    const tBeat = window.setInterval(beat, heartMs);
    const tPoll = window.setInterval(poll, pollMs);

    /* ─── Field focus tracking ─────────────────────────────────── */
    function fieldKeyOf(el: Element | null): string | null {
      if (!el || !(el instanceof HTMLElement)) return null;
      const tag = el.tagName;
      const editable = tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
      if (!editable) return null;
      const explicit = el.getAttribute("data-presence-field");
      if (explicit) return explicit;
      const named = (el as HTMLInputElement).name;
      if (named) return named;
      if (el.id) return el.id;
      return "__field__";
    }
    function syncFocused() {
      const next = fieldKeyOf(document.activeElement);
      if (next !== fieldRef.current) {
        fieldRef.current = next;
        beat();
      }
    }
    function onFocusIn() { syncFocused(); }
    function onFocusOut() { setTimeout(syncFocused, 60); }
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);

    /* ─── Cursor tracking (only when fast mode) ─────────────────── */
    function onMouseMove(e: MouseEvent) {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      cursorRef.current = { x: (e.clientX / w) * 100, y: (e.clientY / h) * 100 };
    }
    function onMouseLeave() { cursorRef.current = null; }
    if (fast) {
      window.addEventListener("mousemove", onMouseMove, { passive: true });
      window.addEventListener("mouseleave", onMouseLeave);
    }

    function onUnload() {
      try {
        navigator.sendBeacon?.(
          "/api/presence/leave",
          new Blob([JSON.stringify({ scope })], { type: "application/json" }),
        );
      } catch { /* */ }
    }
    window.addEventListener("beforeunload", onUnload);

    return () => {
      cancelled = true;
      clearInterval(tBeat);
      clearInterval(tPoll);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("beforeunload", onUnload);
      apiPost("/api/presence/leave", { scope }).catch(() => {});
      fieldRef.current = null;
      lastSentCursorRef.current = null;
    };
  }, [scope, user?.id, fast, path]);

  return { peers };
}

/** Deterministic accent color per user id, same ring color every time. */
export function presenceColor(id: string): string {
  const palette = [
    "#5b6dff", "#ec4899", "#10b981", "#f59e0b",
    "#a855f7", "#ef4444", "#06b6d4", "#84cc16",
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function peerAvatarUrl(p: Peer, size = 64): string {
  if (p.avatar) {
    return `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png?size=${size}`;
  }
  try {
    const idx = Number((BigInt(p.id) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  } catch {
    return `https://cdn.discordapp.com/embed/avatars/0.png`;
  }
}
