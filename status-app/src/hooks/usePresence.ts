import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/api/auth";
import { apiGet, apiPost } from "@/api/client";

export interface Peer {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  field?: string | null;
}

const HEARTBEAT_MS = 8000;
const POLL_MS = 6000;

/**
 * Subscribes the current user to a presence "scope" (typically the SPA
 * route path). Sends heartbeats while mounted, polls the peer list,
 * and tracks which input the user has focused — so peers can show a
 * mini avatar next to the field being edited.
 *
 * The hook reads `data-presence-field`, then `name`, then `id` on the
 * focused element to derive the field key. Inputs without any of those
 * are tracked as "editing (unnamed)" — the peer stack still shows
 * activity, just without pinning to a specific field.
 */
export function usePresence(scope: string | null) {
  const { user } = useAuth();
  const [peers, setPeers] = useState<Peer[]>([]);
  const fieldRef = useRef<string | null>(null);

  useEffect(() => {
    if (!scope || !user) { setPeers([]); return; }
    let cancelled = false;

    function beat() {
      apiPost("/api/presence/heartbeat", { scope, field: fieldRef.current })
        .catch(() => { /* silent — anonymous / offline / demo */ });
    }
    function poll() {
      apiGet<{ peers: Peer[] }>(`/api/presence?scope=${encodeURIComponent(scope!)}`)
        .then(r => { if (!cancelled) setPeers(r.peers || []); })
        .catch(() => { /* silent */ });
    }

    beat(); poll();
    const tBeat = window.setInterval(beat, HEARTBEAT_MS);
    const tPoll = window.setInterval(poll, POLL_MS);

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
      // Editing something unnamed — still publish a placeholder so
      // peers see "is writing" without a specific field label.
      return "__field__";
    }
    function syncFocused() {
      const next = fieldKeyOf(document.activeElement);
      if (next !== fieldRef.current) {
        fieldRef.current = next;
        beat();
      }
    }
    // Wait one tick on focusout — tabbing between fields fires
    // focusout-then-focusin synchronously; we want the final state.
    function onFocusIn() { syncFocused(); }
    function onFocusOut() { setTimeout(syncFocused, 60); }

    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);

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
      window.removeEventListener("beforeunload", onUnload);
      apiPost("/api/presence/leave", { scope }).catch(() => {});
      fieldRef.current = null;
    };
  }, [scope, user?.id]);

  return { peers };
}

/** Deterministic accent color per user id — same ring color every time. */
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
