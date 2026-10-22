import { colors, spacing } from '@site-diary/ui-tokens';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { db, useDb, type Row } from '../lib/db';
import { useT } from '../lib/i18n';
import { Chip, Field, Input, Stepper } from './ui';

/**
 * Chips for a list (contractors, materials, floors…) in the caller's order — "most used first" via `byUse`.
 * With `max`, a long list shows the first few and a "More" chip, so the usual ones are one tap away
 * (only for lists ordered by use: floors keep their building order and always show in full).
 */
export function RowChips({ label, rows, value, onChange, nameOf, allowNone, noneLabel, max = Infinity }: {
  label: string; rows: Row[]; value: string | null; onChange: (id: string | null) => void; nameOf: (r: Row) => string; allowNone?: boolean; noneLabel?: string; max?: number;
}) {
  const t = useT();
  const [all, setAll] = useState(false);
  const short = !all && rows.length > max + 2;
  const shown = short ? rows.filter((r, i) => i < max || r.id === value) : rows;
  return (
    <Field label={label}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {allowNone ? <Chip label={noneLabel ?? '—'} selected={value === null} onPress={() => onChange(null)} /> : null}
        {shown.map((r) => <Chip key={r.id} label={nameOf(r)} selected={r.id === value} onPress={() => onChange(r.id)} />)}
        {short ? <Chip label={t('common.more', { count: rows.length - shown.length })} tone="muted" onPress={() => setAll(true)} /> : null}
      </View>
    </Field>
  );
}

/** Most used first (ties keep the given order): `used` lists the ids from past entries, repeats counted. */
export function byUse(rows: Row[], used: unknown[]): Row[] {
  const n = new Map<unknown, number>();
  for (const id of used) n.set(id, (n.get(id) ?? 0) + 1);
  return rows.map((r, i) => ({ r, i })).sort((a, b) => (n.get(b.r.id) ?? 0) - (n.get(a.r.id) ?? 0) || a.i - b.i).map((x) => x.r);
}

/** Materials, the ones this phone's sites receive, use and request most first. */
export function useMaterials(): Row[] {
  return useDb(() => byUse(db.rows('material'), [...db.rows('grnLine'), ...db.rows('materialIssue'), ...db.rows('indentLine')].map((r) => r.materialId)));
}

/** Quantities: whole units for bags/nos, decimals for brass/ton/cum. */
export function QtyField({ label, unit, value, onChange }: { label: string; unit?: string; value: number; onChange: (v: number) => void }) {
  const t = useT();
  const fine = ['brass', 'ton', 'cum', 'litre'].includes(unit ?? '');
  return (
    <Field label={label && unit ? `${label} (${unit})` : label}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Stepper label={label || t('report.qty')} value={value} onChange={onChange} step={fine ? 0.5 : unit === 'kg' ? 50 : 1} decimals={fine ? 3 : unit === 'kg' ? 1 : 0} max={9_999_999} />
        {!label && unit ? <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>{unit}</Text> : null}
      </View>
      {/* Big quantities without a hundred taps: add 10 / 50 / 100 at a time. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {(fine ? [1, 5] : unit === 'kg' ? [100, 500, 1000] : [10, 50, 100]).map((n) => <Chip key={n} label={`+${n}`} tone="muted" onPress={() => onChange(Math.round((value + n) * 1000) / 1000)} />)}
      </View>
    </Field>
  );
}

export function TextField({ label, value, onChange, placeholder, multiline }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  return (
    <Field label={label}>
      <Input value={value} onChangeText={onChange} placeholder={placeholder} multiline={multiline} accessibilityLabel={label || placeholder} />
    </Field>
  );
}
