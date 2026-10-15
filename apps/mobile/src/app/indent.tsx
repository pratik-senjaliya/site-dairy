import { addDays, isoDate } from '@site-diary/shared';
import { spacing } from '@site-diary/ui-tokens';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { View } from 'react-native';
import { QtyField, RowChips, TextField } from '../components/pickers';
import { Button, Card, Chip, Field, Row, Screen, T } from '../components/ui';
import { db, useDb } from '../lib/db';
import { done, notice, useSite } from '../lib/hooks';
import { useName, useT } from '../lib/i18n';

type Line = { id: string; materialId: string; qty: number };
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'muted'> = { approved: 'ok', ordered: 'ok', rejected: 'warn', submitted: 'muted' };

// M8: material request from site → engineer/owner approval → purchase order (web).
export default function Indent() {
  const t = useT();
  const name = useName();
  const { siteId } = useSite();
  const [indentId] = useState(randomUUID);
  const materials = useDb(() => db.rows('material'));
  const mine = useDb(() => db.rows('indent').filter((i) => i.projectId === siteId).sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))).slice(0, 8));
  const lines = useDb(() => db.rows('indentLine'));
  const [items, setItems] = useState<Line[]>([]);
  const [current, setCurrent] = useState<Line>({ id: randomUUID(), materialId: '', qty: 0 });
  const [neededIn, setNeededIn] = useState(2);
  const [note, setNote] = useState('');
  const all = current.materialId && current.qty ? [...items, current] : items;
  const unit = (id: string) => String(materials.find((m) => m.id === id)?.unit ?? '');

  return (
    <Screen title={t('home.indent')} footer={<Button label={t('indent.send')} disabled={!all.length} onPress={() => {
      db.save('indent', { id: indentId, projectId: siteId, status: 'submitted', neededBy: addDays(isoDate(), neededIn), note: note || null });
      for (const l of all) db.save('indentLine', { id: l.id, indentId, materialId: l.materialId, qty: l.qty });
      notice(t('common.saved'), t('indent.sentHint'));
      done();
    }} />}>
      {items.map((l) => <T.body key={l.id} bold>• {name(materials.find((m) => m.id === l.materialId))} · {l.qty} {unit(l.materialId)}</T.body>)}
      <Card>
        <RowChips label={t('report.material')} rows={materials} value={current.materialId || null} onChange={(id) => setCurrent((c) => ({ ...c, materialId: id ?? '' }))} nameOf={name} />
        {current.materialId ? (
          <>
            <QtyField label={t('report.qty')} unit={unit(current.materialId)} value={current.qty} onChange={(qty) => setCurrent((c) => ({ ...c, qty }))} />
            <Button kind="secondary" small label={t('grn.addAnother')} disabled={!current.qty} onPress={() => { setItems((x) => [...x, current]); setCurrent({ id: randomUUID(), materialId: '', qty: 0 }); }} />
          </>
        ) : null}
      </Card>
      <Field label={t('indent.neededBy')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {[0, 1, 2, 3, 5, 7].map((d) => <Chip key={d} label={d === 0 ? t('common.today') : d === 1 ? t('indent.tomorrow') : t('indent.inDays', { count: d })} selected={neededIn === d} onPress={() => setNeededIn(d)} />)}
        </View>
      </Field>
      <TextField label={t('report.note')} value={note} onChange={setNote} multiline />
      {mine.length ? (
        <Card>
          <T.h2>{t('indent.recent')}</T.h2>
          {mine.map((i) => (
            <Row key={i.id} style={{ justifyContent: 'space-between' }}>
              <T.small>{lines.filter((l) => l.indentId === i.id).map((l) => `${name(materials.find((m) => m.id === l.materialId))} ${String(l.qty)}`).join(', ')}</T.small>
              <Chip label={t(`status.${String(i.status)}` as 'status.submitted')} tone={STATUS_TONE[String(i.status)] ?? 'muted'} />
            </Row>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
