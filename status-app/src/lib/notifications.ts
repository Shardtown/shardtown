/**
 * Native OS notifications bridge for the Tauri desktop app.
 *
 * Exposes a `notify()` that — in desktop mode — pops a macOS Notification
 * Center entry via tauri-plugin-notification. In web mode it's a no-op so
 * call sites don't need to branch on IS_DESKTOP themselves.
 *
 * Notifications are grouped into four user-controllable categories. The
 * user can mute any of them from Preferences; the master switch is on by
 * default (the app requests OS permission on first use).
 */

import { IS_DESKTOP } from "./desktop";

export type NotifCategory = "updates" | "bot-state" | "long-actions" | "server-activity";

export interface NotifPrefs {
    /** Master switch — when false nothing is ever sent. */
    enabled: boolean;
    /** Per-category mute. Missing keys default to enabled. */
    perCategory: Record<NotifCategory, boolean>;
}

const STORAGE_KEY = "shardtown.notifications.v1";

const DEFAULT_PREFS: NotifPrefs = {
    enabled: true,
    perCategory: {
        "updates": true,
        "bot-state": true,
        "long-actions": true,
        "server-activity": true,
    },
};

export function loadNotifPrefs(): NotifPrefs {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as Partial<NotifPrefs>;
            return {
                enabled: parsed.enabled ?? DEFAULT_PREFS.enabled,
                perCategory: { ...DEFAULT_PREFS.perCategory, ...(parsed.perCategory ?? {}) },
            };
        }
    } catch { /* */ }
    return { ...DEFAULT_PREFS, perCategory: { ...DEFAULT_PREFS.perCategory } };
}

export function saveNotifPrefs(prefs: NotifPrefs): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* */ }
}

let permissionPromise: Promise<boolean> | null = null;

/**
 * Lazily request notification permission from macOS. The system prompt
 * only shows once per app install; subsequent calls re-use the cached
 * answer. Resolves to true if granted, false otherwise.
 */
async function ensurePermission(): Promise<boolean> {
    if (!IS_DESKTOP) return false;
    if (permissionPromise) return permissionPromise;
    permissionPromise = (async () => {
        try {
            const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification");
            if (await isPermissionGranted()) return true;
            const result = await requestPermission();
            return result === "granted";
        } catch (e) {
            console.warn("[notifications] permission request failed:", e);
            return false;
        }
    })();
    return permissionPromise;
}

export interface NotifyArgs {
    category: NotifCategory;
    title: string;
    body: string;
    /** Optional sound preset id mirrored to the existing sound pipeline. */
    silent?: boolean;
}

/**
 * Post a native notification, respecting user preferences. Safe to call
 * in web mode — silently does nothing.
 *
 * Errors are swallowed; a missed notification must never break the calling
 * feature.
 */
export async function notify({ category, title, body }: NotifyArgs): Promise<void> {
    if (!IS_DESKTOP) return;
    const prefs = loadNotifPrefs();
    if (!prefs.enabled) return;
    if (!prefs.perCategory[category]) return;
    try {
        const granted = await ensurePermission();
        if (!granted) return;
        const { sendNotification } = await import("@tauri-apps/plugin-notification");
        sendNotification({ title, body });
    } catch (e) {
        console.warn("[notifications] send failed:", e);
    }
}
