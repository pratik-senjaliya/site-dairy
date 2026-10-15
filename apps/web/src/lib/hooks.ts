'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { get } from './api';

const cache = new Map<string, unknown>();

/** GET with a per-path cache: a revisited page shows at once and refreshes quietly. */
export function useFetch<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>(() => (path ? (cache.get(path) as T | undefined) : undefined));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const current = useRef(path);
  current.current = path;
  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const d = await get<T>(path);
      cache.set(path, d);
      if (current.current === path) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (current.current === path) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    setData(path ? (cache.get(path) as T | undefined) : undefined);
    void reload();
  }, [path, reload]);
  return { data, error, loading, reload };
}

export const clearCache = () => cache.clear();
