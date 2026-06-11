export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/* ─── CSRF ───────────────────────────────────────────────────────────────── */

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

/* ─── Transport ──────────────────────────────────────────────────────────── */

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (method !== "GET" && method !== "HEAD") {
    headers["X-CSRF-Token"] = await getCsrf();
  }

  const init: RequestInit = {
    method,
    credentials: "include",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  let res = await fetch(path, init);

  // CSRF token stale — refresh once and retry
  if (res.status === 403 && method !== "GET" && method !== "HEAD") {
    clearCsrf();
    headers["X-CSRF-Token"] = await getCsrf();
    res = await fetch(path, { ...init, headers });
  }

  if (!res.ok) {
    if (res.status === 401) {
      const mainSite = import.meta.env.VITE_MAIN_SITE_URL ?? 'https://shardtwn.fr';
      window.location.replace(`${mainSite}/shard/login?returnTo=${encodeURIComponent(window.location.href)}`);
      throw new ApiError(401, 'Non authentifié');
    }
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new ApiError(res.status, (data.error as string) || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const get  = <T>(path: string)                 => request<T>("GET",    path);
export const post = <T>(path: string, body?: unknown)  => request<T>("POST",   path, body);
export const put  = <T>(path: string, body?: unknown)  => request<T>("PUT",    path, body);
export const del  = <T>(path: string)                  => request<T>("DELETE", path);
