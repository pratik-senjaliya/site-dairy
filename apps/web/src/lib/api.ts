'use client';

// The browser calls /api/v1/* on its own origin (proxied to the API); sign-in lives in httpOnly cookies.

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'error', public issues?: { path: (string | number)[]; message: string }[]) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;
const refresh = () =>
  (refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    }));

export async function api<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: body instanceof Blob || body instanceof ArrayBuffer ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : body instanceof Blob || body instanceof ArrayBuffer ? body : JSON.stringify(body),
  });
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refresh()) return api<T>(method, path, body, false);
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
  }
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string; issues?: ApiError['issues'] } };
  if (!res.ok) throw new ApiError(res.status, data.error?.message ?? `Error ${res.status}`, data.error?.code, data.error?.issues);
  return data as T;
}

export const get = <T>(path: string) => api<T>('GET', path);
export const post = <T>(path: string, body?: unknown) => api<T>('POST', path, body ?? {});
export const patch = <T>(path: string, body: unknown) => api<T>('PATCH', path, body);
export const del = <T>(path: string) => api<T>('DELETE', path);

/** Excel/PDF downloads keep the cookie because they are same-origin links. */
export const fileUrl = (path: string) => `/api/v1${path}`;

export const errorText = (e: unknown) =>
  e instanceof ApiError && e.issues?.length ? e.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ') : e instanceof Error ? e.message : String(e);
