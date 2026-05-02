/**
 * API client with automatic CSRF token handling.
 *
 * Every non-GET request fetches /api/csrf once (cached for the page lifetime)
 * and sends the token as the X-CSRF-Token header. On a 403, the token is
 * refreshed and the request retried once.
 */

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

let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;

async function fetchCsrf(): Promise<string> {
  const res = await fetch("/api/csrf", { credentials: "include" });
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

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const doFetch = async () => {
    const token = await getCsrf();
    return fetch(path, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": token,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doFetch();

  // CSRF token may be stale (session regenerated, server restarted, ...).
  // Refresh once and retry — surfacing the original 403 if the retry also fails.
  if (res.status === 403) {
    clearCsrf();
    res = await doFetch();
  }

  if (!res.ok) throw await parseError(res);

  // Some endpoints return 204 No Content
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export const apiPost = <T>(path: string, body?: unknown) => send<T>("POST", path, body);
export const apiPut = <T>(path: string, body?: unknown) => send<T>("PUT", path, body);
export const apiPatch = <T>(path: string, body?: unknown) => send<T>("PATCH", path, body);
export const apiDelete = <T>(path: string, body?: unknown) => send<T>("DELETE", path, body);

/**
 * POST + return the raw streaming response (for SSE / NDJSON / chunked).
 * Same CSRF + retry-on-403 dance as `send`. Caller is responsible for
 * reading `response.body` themselves.
 */
export async function apiPostStream(path: string, body?: unknown): Promise<Response> {
  const doFetch = async () => {
    const token = await getCsrf();
    return fetch(path, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": token,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doFetch();
  if (res.status === 403) {
    clearCsrf();
    res = await doFetch();
  }
  return res;
}
