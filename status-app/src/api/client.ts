/**
 * API client — works in two modes:
 *
 *   Web   : cookie-based session auth + CSRF token (current behavior).
 *   Tauri : Bearer-token auth via `tauri-plugin-http` (Rust-side fetch, so
 *           it bypasses WebView CORS). No CSRF needed because the bearer
 *           middleware on the server skips the CSRF guard for explicit
 *           Authorization headers.
 *
 * The mode is decided at module load by `IS_DESKTOP` from `lib/desktop.ts`.
 * Callers don't change — `apiGet`/`apiPost` etc. dispatch transparently.
 */

import { IS_DESKTOP, API_BASE } from "../lib/desktop";
import { isDemoMode, mockApiCall, DEMO_TOKEN, enableDemoMode } from "../lib/demo";

/**
 * Error thrown by the API client. Exposes the HTTP status code and the
 * parsed JSON body so callers can branch on `err.status === 429` and
 * read structured fields like `err.data.lockedUntil` instead of doing
 * fragile `err.message.includes("401")` string matching.
 */
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

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/* ─── Bearer-token state (desktop only) ───────────────────────────────── */

let bearerToken: string | null = null;
const bearerListeners = new Set<(token: string | null) => void>();

export function setBearerToken(token: string | null) {
  bearerToken = token;
  // If we're handed the demo magic, auto-enable demo mode so any
  // subsequent request goes through the mock — even if localStorage's
  // demo flag has been wiped between launches.
  if (token === DEMO_TOKEN) enableDemoMode();
  bearerListeners.forEach(fn => fn(token));
}
export function getBearerToken(): string | null { return bearerToken; }
export function onBearerTokenChange(fn: (token: string | null) => void): () => void {
  bearerListeners.add(fn);
  return () => bearerListeners.delete(fn);
}

/* ─── CSRF (web only) ─────────────────────────────────────────────────── */

let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;

async function fetchCsrf(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/csrf`, { credentials: "include" });
  if (!res.ok) return "";
  const data = (await res.json()) as { csrfToken?: string };
  return data.csrfToken || "";
}

async function getCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    csrfPromise = fetchCsrf().then(t => {
      csrfToken = t;
      csrfPromise = null;
      return t;
    });
  }
  return csrfPromise;
}

function clearCsrf() {
  csrfToken = null;
}

/* ─── Response parsing ────────────────────────────────────────────────── */

async function parseError(res: Response): Promise<ApiError> {
  const text = await res.text().catch(() => "");
  let data: unknown = undefined;
  let message = `${res.status} ${res.statusText}`;
  if (text) {
    try {
      data = JSON.parse(text);
      const errField = (data as { error?: unknown })?.error;
      if (typeof errField === "string" && errField) message = errField;
    } catch {
      message = text;
    }
  }
  return new ApiError(res.status, message, data);
}

/* ─── Transport ───────────────────────────────────────────────────────── */

interface TransportOptions {
  method: string;
  path: string;
  body?: unknown;
  /** Streaming responses (SSE / NDJSON). Defaults to false. */
  stream?: boolean;
}

/**
 * Routes the request through either the desktop Bearer transport or the
 * web cookie transport. Returns the raw Response so callers (including the
 * streaming wrapper) can decide how to consume the body.
 */
async function rawSend({ method, path, body, stream }: TransportOptions): Promise<Response> {
  const url = `${API_BASE}${path}`;

  // Demo mode short-circuits all network. We return a synthetic Response
  // built from the mock module so the rest of the pipeline (apiGet / send
  // / parseError) keeps working unchanged. Fully offline-capable.
  //
  // Two triggers — either the localStorage flag is on, OR the current
  // bearer token is the demo magic. The second case covers the launch-
  // after-localStorage-wipe scenario: keychain still has the demo
  // token, app should automatically stay offline.
  if (isDemoMode() || bearerToken === DEMO_TOKEN) {
    const mock = mockApiCall(method, path, body);
    if (mock) {
      const text = typeof mock.body === "string" ? mock.body : JSON.stringify(mock.body);
      return new Response(text, {
        status: mock.status,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (IS_DESKTOP) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
    return tauriFetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }) as unknown as Response;
  }

  const init: RequestInit = {
    method,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (method !== "GET" && method !== "HEAD") {
    headers["X-CSRF-Token"] = await getCsrf();
  }
  init.headers = headers;
  const res = await fetch(url, init);

  // CSRF token may be stale (session regenerated, server restarted, ...).
  // Refresh once and retry — surfacing the original 403 if the retry also fails.
  // Streaming requests can't be retried after the body's been consumed, so
  // we only retry non-stream requests.
  if (res.status === 403 && !stream && (method !== "GET" && method !== "HEAD")) {
    clearCsrf();
    const retryHeaders = { ...headers, "X-CSRF-Token": await getCsrf() };
    return fetch(url, { ...init, headers: retryHeaders });
  }
  return res;
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await rawSend({ method, path, body });
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  return send<T>("GET", path);
}

export const apiPost = <T>(path: string, body?: unknown) => send<T>("POST", path, body);
export const apiPut = <T>(path: string, body?: unknown) => send<T>("PUT", path, body);
export const apiPatch = <T>(path: string, body?: unknown) => send<T>("PATCH", path, body);
export const apiDelete = <T>(path: string, body?: unknown) => send<T>("DELETE", path, body);

/**
 * POST + return the raw streaming response (for SSE / NDJSON / chunked).
 * Caller is responsible for reading `response.body` themselves.
 *
 * Note: in desktop mode, tauri-plugin-http doesn't surface a streaming body
 * the same way browser fetch does. The Assistant route (the only current
 * stream consumer) is a marketing page that's already redirected away from
 * in desktop mode, so this stays browser-only for now.
 */
export async function apiPostStream(path: string, body?: unknown): Promise<Response> {
  return rawSend({ method: "POST", path, body, stream: true });
}
