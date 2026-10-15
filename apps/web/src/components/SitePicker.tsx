'use client';

import { Select } from 'antd';
import { useEffect } from 'react';
import { useMe } from '../lib/session';

/** Site filter shared by the registers; remembers the last choice in this browser. */
export function SitePicker({ value, onChange, allowAll }: { value: string | undefined; onChange: (id: string | undefined) => void; allowAll?: boolean }) {
  const me = useMe();
  const sites = me?.projects ?? [];
  useEffect(() => {
    if (value || allowAll || !sites.length) return;
    let last: string | null = null;
    try {
      last = localStorage.getItem('site');
    } catch {
      // storage blocked
    }
    onChange(sites.find((s) => s.id === last)?.id ?? sites[0]!.id);
  }, [value, allowAll, sites, onChange]);
  return (
    <Select
      style={{ minWidth: 220 }}
      value={value ?? (allowAll ? 'all' : undefined)}
      placeholder="Site"
      onChange={(v: string) => {
        const id = v === 'all' ? undefined : v;
        try {
          if (id) localStorage.setItem('site', id);
        } catch {
          // storage blocked
        }
        onChange(id);
      }}
      options={[...(allowAll ? [{ value: 'all', label: 'All sites' }] : []), ...sites.map((s) => ({ value: s.id, label: s.name }))]}
    />
  );
}
