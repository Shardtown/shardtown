/**
 * API client with automatic CSRF token handling.
 *
 * Every non-GET request fetches /api/csrf once (cached for the page lifetime)
 * and sends the token as the X-CSRF-Token header. On a 403, the token is
 * refreshed and the request retried once.
 */

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

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
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

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status} ${res.statusText}`);
  }

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
