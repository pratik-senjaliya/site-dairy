import { formatPaise } from '@site-diary/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Banner, Card, Empty, flush, ListRow, Screen, Stat } from '../components/ui';
import { ApiError, get } from '../lib/api';
import { db, useDb } from '../lib/db';
import { useT } from '../lib/i18n';
import type { Ledger } from '../lib/setup';

// The udhar khata with suppliers: what each is owed for material received, less what was paid.
export default function Suppliers() {
  const t = useT();
  const suppliers = useDb(() => db.rows('supplier').slice().sort((a, b) => String(a.name).localeCompare(String(b.name))));
  const ids = suppliers.map((s) => s.id).join(',');
  const [ledgers, setLedgers] = useState<Record<string, Ledger> | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Depends only on the list of suppliers (not on render-time helpers), so it loads once per change.
  const load = useCallback(async () => {
    try {
      const all = await Promise.all(ids.split(',').filter(Boolean).map(async (id) => [id, await get<Ledger>(`/purchase/supplier-ledger/${id}`)] as const));
      setLedgers(Object.fromEntries(all));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'offline' ? 'offline' : e instanceof Error ? e.message : String(e));
    }
  }, [ids]);
  useEffect(() => void load(), [load]);
  // Back from a supplier (a payment, a rate): the totals again.
  const seen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (seen.current) void load();
    seen.current = true;
  }, [load]));

  const used = suppliers.filter((s) => ledgers?.[s.id]?.rows.length);
  const total = used.reduce((x, s) => x + Math.max(0, ledgers?.[s.id]?.duePaise ?? 0), 0);
  return (
    <Screen title={t('supplier.title')}>
      {error ? <Banner tone="error" text={error === 'offline' ? t('common.offlineOnline') : error} onPress={() => void load()} /> : null}
      {ledgers ? <Stat value={formatPaise(total)} label={t('supplier.totalDue')} tone={total ? 'warn' : 'ok'} /> : null}
      {ledgers && !used.length ? <Empty icon="truck-outline" text={t('supplier.none')} /> : null}
      {used.length ? (
        <Card style={flush}>
          {used.map((s, i) => {
            const l = ledgers![s.id]!;
            const unpriced = l.rows.reduce((x, r) => x + r.unpricedLines, 0);
            return (
              <ListRow
                key={s.id}
                icon="truck-outline"
                tone={unpriced ? 'warn' : l.duePaise > 0 ? 'primary' : 'ok'}
                title={String(s.name)}
                detail={unpriced ? t('supplier.unpriced', { count: unpriced }) : undefined}
                value={l.duePaise > 0 ? formatPaise(l.duePaise) : unpriced ? t('supplier.rateNeeded') : t('supplier.allPaid')}
                onPress={() => router.push({ pathname: '/supplier', params: { id: s.id } })}
                last={i === used.length - 1}
              />
            );
          })}
        </Card>
      ) : null}
    </Screen>
  );
}
