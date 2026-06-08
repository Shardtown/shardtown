export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new ApiError(res.status, (data.error as string) || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const get  = <T>(path: string)                => request<T>("GET",    path);
export const post = <T>(path: string, body?: unknown) => request<T>("POST",   path, body);
export const put  = <T>(path: string, body?: unknown) => request<T>("PUT",    path, body);
export const del  = <T>(path: string)                 => request<T>("DELETE", path);
