import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';
import { kv, secure } from './kv';
import { demoApi, DemoError, saveDemoPhoto } from '../demo/server';

// The phone talks to the API directly with a bearer token (X-Client: mobile); the refresh token is
// bound to this device id and rotates on every use.

// Build-time address, else (development) the computer running Expo: in Expo Go that is the dev server's host.
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
const DEFAULT_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === 'web' && typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : `http://${devHost ?? 'localhost'}:4000`);

let baseUrl = DEFAULT_URL;

/** Demo mode: the app answers itself (src/demo/server.ts); no server or internet. Built-in with EXPO_PUBLIC_DEMO=1. */
export const DEMO_BUILD = process.env.EXPO_PUBLIC_DEMO === '1';
let demo = DEMO_BUILD;
export const isDemo = () => demo;
export async function setDemo(on: boolean) {
  demo = DEMO_BUILD || on;
  if (on) await kv.set('demo', '1');
  else await kv.remove('demo');
}
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
  demo = DEMO_BUILD || (await kv.get('demo')) === '1';
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
  if (demo) {
    try {
      return (await demoApi(method, path, body, access)) as T;
    } catch (e) {
      if (e instanceof DemoError) throw new ApiError(e.status, e.message, e.code);
      throw e;
    }
  }
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
export const patch = <T>(path: string, body: unknown) => api<T>('PATCH', path, body);
export const del = <T>(path: string) => api<T>('DELETE', path);

/** Raw upload (photos), with one refresh on 401. */
export async function putBlob(path: string, blob: Blob, type: string): Promise<void> {
  if (demo) {
    await saveDemoPhoto(path.split('/')[2]!, blob);
    return;
  }
  const send = () => fetch(apiUrl(path), { method: 'PUT', headers: { 'content-type': type, ...authHeaders() }, body: blob });
  let res = await send();
  if (res.status === 401 && (await refresh())) res = await send();
  if (!res.ok) throw new ApiError(res.status, `Upload failed (${res.status})`);
}
