import { fetch } from "@tauri-apps/plugin-http";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "https://shardtwn.fr";

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/**
 * Tauri's HTTP client (rather than the browser fetch) lets us:
 * - bypass the WebView's CORS rules; we're talking to a different origin
 *   from `tauri://localhost`, so a normal fetch would be blocked.
 * - keep cookies isolated to per-call needs (we don't want any).
 *
 * We always send `Authorization: Bearer <token>` from the Keychain.
 */
async function request<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let data: unknown;
    let message = `${res.status} ${res.statusText}`;
    try {
      const text = await res.text();
      if (text) {
        try {
          data = JSON.parse(text);
          const errField = (data as { error?: unknown })?.error;
          if (typeof errField === "string" && errField) message = errField;
        } catch {
          message = text;
        }
      }
    } catch { /* swallow */ }
    throw new ApiError(res.status, message, data);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export const apiGet = <T>(path: string, token: string) => request<T>("GET", path, token);
export const apiPost = <T>(path: string, token: string, body?: unknown) =>
  request<T>("POST", path, token, body);

// ─── Domain types — kept minimal, mirrors `publicAccount` server-side ──
export interface AccountMe {
  id: number;
  email: string;
  email_verified: boolean;
  pseudo: string | null;
  discord_id: string | null;
  discord_username: string | null;
  discord_avatar: string | null;
  shard_id: string | null;
  shard_username: string | null;
  shard_avatar: string | null;
  created_at: string;
}

export async function fetchMe(token: string): Promise<AccountMe | null> {
  const r = await apiGet<{ account: AccountMe | null }>("/api/account/me", token);
  return r.account;
}
