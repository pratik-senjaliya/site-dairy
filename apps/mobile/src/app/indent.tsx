import { addDays, formatNumber, isoDate, shortDate } from '@site-diary/shared';
import { spacing } from '@site-diary/ui-tokens';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { QtyField, RowChips, TextField, useMaterials } from '../components/pickers';
import { Ask, Banner, Button, Card, Chip, DiaryLine, Row, Screen, T } from '../components/ui';
import { db, useDb } from '../lib/db';
import { done, notice, useCan, useSite } from '../lib/hooks';
import { useName, useT } from '../lib/i18n';
import { useDiary } from '../lib/diary';
import { awaitedMaterial } from '../lib/stock';

type Line = { id: string; materialId: string; qty: number };
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'muted'> = { approved: 'ok', ordered: 'ok', rejected: 'warn', submitted: 'muted' };

// M8: material request from site → engineer/owner approval → purchase order (web).
export default function Indent() {
  const t = useT();
  const name = useName();
  const { siteId } = useSite();
  const [indentId] = useState(randomUUID);
  const materials = useMaterials();
  const mine = useDb(() => db.rows('indent').filter((i) => i.projectId === siteId).sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))).slice(0, 8));
  const lines = useDb(() => db.rows('indentLine'));
  // Asked for earlier and not come yet: shown when the same material is picked again, so it is not ordered twice.
  const asked = useDb(() => awaitedMaterial(siteId, true));
  const [items, setItems] = useState<Line[]>([]);
  // From the stock screen: the material that is running out, and about a week's use.
  const from = useLocalSearchParams<{ material?: string; qty?: string }>();
  const [current, setCurrent] = useState<Line>({ id: randomUUID(), materialId: from.material ?? '', qty: Number(from.qty) || 0 });
  const [neededIn, setNeededIn] = useState(2);
  const [note, setNote] = useState('');
  const all = current.materialId && current.qty ? [...items, current] : items;
  const unit = (id: string) => String(materials.find((m) => m.id === id)?.unit ?? '');
  const diary = useDiary();
  const can = useCan();
  const approver = can('indent', 'A');
  const canOrder = approver && can('po', 'C');
  const [busy, setBusy] = useState(false);
  const item = (l: Line) => diary.material(l.materialId, l.qty);

  return (
    <Screen
      title={t('home.indent')}
      footer={
        <>
          {all.length ? <DiaryLine text={diary.indent(all.map(item).join(', '), neededIn)} /> : null}
          <Button label={approver ? (canOrder ? t('indent.saveOrder') : t('common.save')) : t('indent.send')} icon={canOrder ? 'cart-arrow-right' : undefined} busy={busy} disabled={!all.length} onPress={() => {
            db.save('indent', { id: indentId, projectId: siteId, status: 'submitted', neededBy: addDays(isoDate(), neededIn), note: note || null });
            for (const l of all) db.save('indentLine', { id: l.id, indentId, materialId: l.materialId, qty: l.qty });
            // Approvers' own requests are approved on the server; the owner goes on to order it.
            if (canOrder) {
              setBusy(true);
              void db.sync().finally(() => router.replace({ pathname: '/order', params: { indent: indentId } }));
              return;
            }
            notice(t('common.saved'), approver ? undefined : t('indent.sentHint'));
            done();
          }} />
        </>
      }
    >
      {items.length ? (
        <Card>
          <T.small>{t('grn.added')}</T.small>
          {items.map((l) => (
            <Row key={l.id} style={{ justifyContent: 'space-between' }}>
              <T.body bold>{item(l)}</T.body>
              <Button kind="ghost" small label="✕" onPress={() => setItems((x) => x.filter((y) => y.id !== l.id))} />
            </Row>
          ))}
        </Card>
      ) : null}
      <Ask q={t('indent.qWhat')}>
        <RowChips label="" rows={materials} max={8} value={current.materialId || null} onChange={(id) => setCurrent((c) => ({ ...c, materialId: id ?? '' }))} nameOf={name} />
      </Ask>
      {current.materialId ? (
        <>
          {asked.filter((x) => x.materialId === current.materialId).map((x) => (
            <Banner key={x.indentId} tone="info" text={t('stock.asked', { qty: formatNumber(x.qty), unit: unit(x.materialId), date: shortDate(x.neededBy) })} />
          ))}
          <Ask q={t('indent.qHowMuch')}>
            <QtyField label="" unit={unit(current.materialId)} value={current.qty} onChange={(qty) => setCurrent((c) => ({ ...c, qty }))} />
          </Ask>
          <Button kind="secondary" small label={t('grn.addAnother')} disabled={!current.qty} onPress={() => { setItems((x) => [...x, current]); setCurrent({ id: randomUUID(), materialId: '', qty: 0 }); }} />
        </>
      ) : null}
      <Ask q={t('indent.qWhen')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {[0, 1, 2, 3, 5, 7].map((d) => <Chip key={d} label={d === 0 ? t('common.today') : d === 1 ? t('indent.tomorrow') : t('indent.inDays', { count: d })} selected={neededIn === d} onPress={() => setNeededIn(d)} />)}
        </View>
      </Ask>
      <Ask q={t('progress.qNote')} optional>
        <TextField label="" value={note} onChange={setNote} multiline placeholder={t('progress.voiceHint')} />
      </Ask>
      {mine.length ? (
        <Card>
          <T.h2>{t('indent.recent')}</T.h2>
          {mine.map((i) => (
            <Row key={i.id} style={{ justifyContent: 'space-between' }}>
              <T.small>{lines.filter((l) => l.indentId === i.id).map((l) => diary.material(l.materialId, l.qty)).join(', ')}</T.small>
              <Chip label={t(`status.${String(i.status)}` as 'status.submitted')} tone={STATUS_TONE[String(i.status)] ?? 'muted'} />
            </Row>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
