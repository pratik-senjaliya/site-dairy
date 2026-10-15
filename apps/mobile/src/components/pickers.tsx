import { spacing } from '@site-diary/ui-tokens';
import { View } from 'react-native';
import type { Row } from '../lib/db';
import { Chip, Field, Input, Stepper } from './ui';

/** Chips for a short list (contractors, materials, floors…); falls back to "most used first" order from the caller. */
export function RowChips({ label, rows, value, onChange, nameOf, allowNone, noneLabel }: {
  label: string; rows: Row[]; value: string | null; onChange: (id: string | null) => void; nameOf: (r: Row) => string; allowNone?: boolean; noneLabel?: string;
}) {
  return (
    <Field label={label}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {allowNone ? <Chip label={noneLabel ?? '—'} selected={value === null} onPress={() => onChange(null)} /> : null}
        {rows.map((r) => <Chip key={r.id} label={nameOf(r)} selected={r.id === value} onPress={() => onChange(r.id)} />)}
      </View>
    </Field>
  );
}

/** Quantities: whole units for bags/nos, decimals for brass/ton/cum. */
export function QtyField({ label, unit, value, onChange }: { label: string; unit?: string; value: number; onChange: (v: number) => void }) {
  const fine = ['brass', 'ton', 'cum', 'litre'].includes(unit ?? '');
  return (
    <Field label={unit ? `${label} (${unit})` : label}>
      <Stepper label={label} value={value} onChange={onChange} step={fine ? 0.5 : unit === 'kg' ? 50 : 1} decimals={fine ? 3 : unit === 'kg' ? 1 : 0} max={9_999_999} />
    </Field>
  );
}

export function TextField({ label, value, onChange, placeholder, multiline }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  return (
    <Field label={label}>
      <Input value={value} onChangeText={onChange} placeholder={placeholder} multiline={multiline} />
    </Field>
  );
}
