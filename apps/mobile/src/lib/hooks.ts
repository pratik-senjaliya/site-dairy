import { can, type Action, type Module } from '@site-diary/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { askConfirm, showToast } from '../components/Dialogs';
import { ApiError, get } from './api';
import { useSession } from './session';

export function useSite() {
  const { me, siteId } = useSession();
  const site = me?.projects.find((p) => p.id === siteId) ?? null;
  return { siteId: site?.id ?? null, site };
}

export function useCan() {
  const { me } = useSession();
  return (module: Module, action: Action) => (me ? can(me.user.role, module, action) : false);
}

/** Online-only screens (dashboard, approvals): load, reload, and show a friendly error when offline. */
export function useOnline<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await get<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'offline' ? 'offline' : e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, reload: load };
}

export function notice(title: string, message?: string) {
  // Short confirmations never block the next tap: a toast on every platform.
  showToast(title, message);
}

export function confirm(title: string, message: string, ok: string, cancel: string): Promise<boolean> {
  if (Platform.OS === 'web') return askConfirm(title, message, ok, cancel);
  return new Promise((resolve) => Alert.alert(title, message, [{ text: cancel, style: 'cancel', onPress: () => resolve(false) }, { text: ok, onPress: () => resolve(true) }]));
}

/** After saving an entry: back to home (entries sync on their own). */
export const done = () => (router.canGoBack() ? router.back() : router.replace('/home'));
