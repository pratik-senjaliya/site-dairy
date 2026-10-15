import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';
import { kv, secure } from './kv';

// The phone talks to the API directly with a bearer token (X-Client: mobile); the refresh token is
// bound to this device id and rotates on every use.

const DEFAULT_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:4000` : 'http://localhost:4000');

let baseUrl = DEFAULT_URL;
let access: string | null = null;
let deviceId = '';
let onSignedOut: () => void = () => {};

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'error') {
    super(message);
  }
}

export async function initApi(signedOut: () => void) {
  onSignedOut = signedOut;
  baseUrl = (await kv.get('server')) ?? DEFAULT_URL;
  deviceId = (await kv.get('deviceId')) ?? '';
  if (!deviceId) {
    deviceId = randomUUID();
    await kv.set('deviceId', deviceId);
  }
  access = await secure.get('access');
}

export const getServer = () => baseUrl;
export async function setServer(url: string) {
  baseUrl = url.replace(/\/+$/, '') || DEFAULT_URL;
  await kv.set('server', baseUrl);
}
export const getDeviceId = () => deviceId;
export const authHeaders = () => ({ 'x-client': 'mobile', ...(access ? { authorization: `Bearer ${access}` } : {}) });
export const apiUrl = (path: string) => `${baseUrl}/api/v1${path}`;

export async function saveTokens(t: { accessToken?: string; refreshToken?: string }) {
  if (t.accessToken) {
    access = t.accessToken;
    await secure.set('access', t.accessToken);
  }
  if (t.refreshToken) await secure.set('refresh', t.refreshToken);
}

export async function clearTokens() {
  access = null;
  await secure.remove('access');
  await secure.remove('refresh');
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const token = await secure.get('refresh');
    if (!token) return false;
    try {
      const res = await fetch(apiUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client': 'mobile' },
        body: JSON.stringify({ refreshToken: token, deviceId }),
      });
      if (!res.ok) return res.status >= 500 ? true : false; // server trouble is not a sign-out
      await saveTokens((await res.json()) as { accessToken: string; refreshToken: string });
      return true;
    } catch {
      return true; // offline: keep the session, try again later
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function api<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers: { 'content-type': 'application/json', ...authHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'No connection', 'offline');
  }
  if (res.status === 401 && retry && !path.startsWith('/auth/otp')) {
    if (await refresh()) return api<T>(method, path, body, false);
    await clearTokens();
    onSignedOut();
    throw new ApiError(401, 'Please sign in again', 'session_ended');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
  if (!res.ok) throw new ApiError(res.status, data.error?.message ?? `Error ${res.status}`, data.error?.code);
  return data as T;
}

export const get = <T>(path: string) => api<T>('GET', path);
export const post = <T>(path: string, body?: unknown) => api<T>('POST', path, body ?? {});

/** Raw upload (photos), with one refresh on 401. */
export async function putBlob(path: string, blob: Blob, type: string): Promise<void> {
  const send = () => fetch(apiUrl(path), { method: 'PUT', headers: { 'content-type': type, ...authHeaders() }, body: blob });
  let res = await send();
  if (res.status === 401 && (await refresh())) res = await send();
  if (!res.ok) throw new ApiError(res.status, `Upload failed (${res.status})`);
}
