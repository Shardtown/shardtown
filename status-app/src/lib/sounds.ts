/**
 * Configurable notification sounds for desktop app events.
 *
 * Each event type has a user-configurable sound preference (preset name or
 * custom file URL) plus a global enable/volume. Preferences live in
 * localStorage; the desktop has filesystem so we could later persist a
 * custom file path resolved through Tauri's fs plugin — for now the user
 * picks from the bundled presets.
 *
 * Bundled presets are tiny WAVs in /public/sounds. They're rendered through
 * a single shared HTMLAudioElement to avoid leaking memory across plays.
 */

import { IS_DESKTOP } from "./desktop";

export type SoundEvent =
  | "raid"
  | "warn"
  | "ticket"
  | "member_join"
  | "member_leave"
  | "bot_offline"
  | "bot_online"
  | "panic";

export interface SoundPreset {
  id: string;
  label: string;
  url: string;
}

export const PRESETS: SoundPreset[] = [
  { id: "none",       label: "Silencieux",   url: "" },
  { id: "ping",       label: "Ping",         url: "/sounds/Tink.aiff" },
  { id: "pop",        label: "Pop",          url: "/sounds/Pop.aiff" },
  { id: "chime",      label: "Carillon",     url: "/sounds/Glass.aiff" },
  { id: "alert",      label: "Alerte",       url: "/sounds/Funk.aiff" },
  { id: "siren",      label: "Sirène",       url: "/sounds/Submarine.aiff" },
  { id: "bell",       label: "Cloche",       url: "/sounds/Hero.aiff" },
];

export interface SoundEventMeta {
  key: SoundEvent;
  label: string;
  description: string;
  defaultPreset: string;
}

export const EVENTS: SoundEventMeta[] = [
  { key: "raid",         label: "Raid détecté",      description: "Anti-raid déclenché sur un de tes serveurs.",           defaultPreset: "siren" },
  { key: "panic",        label: "Mode panic",        description: "Le mode panic est activé/désactivé.",                   defaultPreset: "alert" },
  { key: "bot_offline",  label: "Bot hors-ligne",    description: "Un de tes bots vient de se déconnecter.",               defaultPreset: "alert" },
  { key: "bot_online",   label: "Bot en ligne",      description: "Un bot redevient disponible.",                          defaultPreset: "chime" },
  { key: "ticket",       label: "Nouveau ticket",    description: "Un membre ouvre un ticket de support.",                 defaultPreset: "bell" },
  { key: "warn",         label: "Avertissement",     description: "Auto-mod ou modérateur émet un warning.",               defaultPreset: "ping" },
  { key: "member_join",  label: "Arrivée membre",    description: "Un nouveau membre rejoint un serveur configuré.",       defaultPreset: "pop" },
  { key: "member_leave", label: "Départ membre",     description: "Un membre quitte un serveur configuré.",                defaultPreset: "none" },
];

export interface SoundsConfig {
  enabled: boolean;
  volume: number;        // 0..1
  perEvent: Record<SoundEvent, string>;  // event -> preset id
}

const STORAGE_KEY = "shardtown.sounds.v1";

function defaultConfig(): SoundsConfig {
  const perEvent = {} as Record<SoundEvent, string>;
  for (const e of EVENTS) perEvent[e.key] = e.defaultPreset;
  return { enabled: true, volume: 0.7, perEvent };
}

export function loadSoundsConfig(): SoundsConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SoundsConfig>;
      const fallback = defaultConfig();
      return {
        enabled: parsed.enabled ?? fallback.enabled,
        volume: parsed.volume ?? fallback.volume,
        perEvent: { ...fallback.perEvent, ...(parsed.perEvent ?? {}) },
      };
    }
  } catch { /* */ }
  return defaultConfig();
}

export function saveSoundsConfig(cfg: SoundsConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch { /* */ }
}

let sharedAudio: HTMLAudioElement | null = null;

/**
 * Play a sound for a given event, respecting the user's preferences.
 * Lazy-creates a single shared <audio> element. Returns a Promise that
 * resolves when playback ends (or fails silently).
 */
export async function playEventSound(event: SoundEvent, override?: string): Promise<void> {
  if (!IS_DESKTOP) return; // sounds are a desktop-only thing
  const cfg = loadSoundsConfig();
  if (!cfg.enabled) return;
  const presetId = override ?? cfg.perEvent[event];
  const preset = PRESETS.find(p => p.id === presetId);
  if (!preset || !preset.url) return; // "none"

  if (!sharedAudio) sharedAudio = new Audio();
  sharedAudio.src = preset.url;
  sharedAudio.volume = Math.max(0, Math.min(1, cfg.volume));
  try { await sharedAudio.play(); } catch { /* autoplay may be blocked, ignore */ }
}

/** Standalone "preview" play — used by the Preferences page test buttons. */
export async function playPreset(presetId: string, volume = 0.7): Promise<void> {
  const preset = PRESETS.find(p => p.id === presetId);
  if (!preset || !preset.url) return;
  if (!sharedAudio) sharedAudio = new Audio();
  sharedAudio.src = preset.url;
  sharedAudio.volume = Math.max(0, Math.min(1, volume));
  try { await sharedAudio.play(); } catch { /* */ }
}
