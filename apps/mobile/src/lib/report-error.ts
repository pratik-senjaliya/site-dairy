import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiUrl } from './api';

/** Crashes go to the API, which logs them and forwards them to Sentry when it is configured. */
export function reportError(error: unknown) {
  const e = error instanceof Error ? error : new Error(String(error));
  void fetch(apiUrl('/client-errors'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ app: 'mobile', message: e.message.slice(0, 2000), stack: e.stack?.slice(0, 10_000), platform: Platform.OS, version: Constants.expoConfig?.version }),
  }).catch(() => {});
}

/** Unhandled JS errors anywhere in the app. */
export function catchGlobalErrors() {
  const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void } };
  if (!g.ErrorUtils) return;
  const previous = g.ErrorUtils.getGlobalHandler();
  g.ErrorUtils.setGlobalHandler((e, fatal) => {
    reportError(e);
    previous(e, fatal);
  });
}
