import { isoDate } from '@site-diary/shared';
import { spacing } from '@site-diary/ui-tokens';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { View } from 'react-native';
import { PhotoThumb } from '../components/Photo';
import { RowChips, TextField } from '../components/pickers';
import { TodayEntries } from '../components/TodayEntries';
import { Button, Card, Chip, Chips, Field, Row, Screen, T } from '../components/ui';
import { db, useDb, type Row as DbRow } from '../lib/db';
import { done, notice, useSite } from '../lib/hooks';
import { useName, useT } from '../lib/i18n';
import { takePhoto } from '../lib/photos';
import { floorName } from '../lib/structure';

type Marker = 'work' | 'weather' | 'holiday' | 'no_work';

// M9: today's work — work item, floor, % done, photos, note (the keyboard's mic button types Gujarati speech).
export default function Progress() {
  const t = useT();
  const name = useName();
  const { siteId } = useSite();
  const today = isoDate();
  const items = useDb(() => db.rows('workItem').filter((w) => w.projectId === siteId).sort((a, b) => Number(a.sort) - Number(b.sort)));
  const floors = useDb(() => db.rows('structureNode').filter((n) => n.projectId === siteId && n.kind === 'floor').sort((a, b) => Number(a.sort) - Number(b.sort)));
  const entries = useDb(() => db.rows('dailyProgress').filter((p) => p.projectId === siteId && p.date === today));
  const siteDay = useDb(() => db.rows('siteDay').find((d) => d.projectId === siteId && d.date === today));
  const [entryId, setEntryId] = useState(randomUUID);
  const [workItemId, setItem] = useState<string | null>(null);
  const [nodeId, setNode] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<DbRow[]>([]);
  const [marker, setMarker] = useState<Marker>((siteDay?.marker as Marker | undefined) ?? 'work');
  const [dayNote, setDayNote] = useState(String(siteDay?.note ?? ''));

  // Last % for this work item and floor, so the supervisor only moves it forward.
  const last = useDb(() => db.rows('dailyProgress').filter((p) => p.workItemId === workItemId && (p.structureNodeId ?? null) === nodeId).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]);

  const saveEntry = () => {
    if (!siteId || !workItemId || percent === null) return;
    db.save('dailyProgress', { id: entryId, projectId: siteId, date: today, workItemId, structureNodeId: nodeId, percent, note: note || null });
    setEntryId(randomUUID());
    setPhotos([]);
    setNote('');
    setPercent(null);
    notice(t('common.saved'));
  };
  const saveDay = () => {
    db.save('siteDay', { ...(siteDay && { id: siteDay.id }), projectId: siteId, date: today, marker, note: dayNote || null });
    if (marker !== 'work') {
      notice(t('common.saved'));
      done();
    }
  };

  return (
    <Screen title={t('home.progress')}>
      <Card>
        <Field label={t('progress.dayType')}>
          <Chips<Marker> options={(['work', 'weather', 'holiday', 'no_work'] as const).map((m) => ({ value: m, label: t(`marker.${m}`) }))} value={marker} onChange={(m) => setMarker(m)} />
        </Field>
        {marker !== 'work' ? <TextField label={t('report.note')} value={dayNote} onChange={setDayNote} multiline /> : null}
        {marker !== 'work' || siteDay?.marker !== marker ? <Button kind="secondary" small label={t('common.save')} onPress={saveDay} /> : null}
      </Card>
      {marker === 'work' && (
        <>
          <TodayEntries entries={entries.map((e) => ({
            id: e.id, table: 'dailyProgress' as const,
            label: `${name(items.find((i) => i.id === e.workItemId))} · ${String(e.percent)}%`,
            sub: e.structureNodeId ? floorName(floors.find((f) => f.id === e.structureNodeId) ?? { id: '', name: '' }) : undefined,
          }))} />
          <RowChips label={t('report.workItem')} rows={items} value={workItemId} onChange={setItem} nameOf={name} />
          <RowChips label={t('report.floor')} rows={floors} value={nodeId} onChange={setNode} nameOf={(r) => floorName(r)} allowNone />
          <Field label={t('report.percent')} hint={last ? t('progress.last', { percent: Number(last.percent), date: String(last.date) }) : undefined}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((p) => <Chip key={p} label={`${p}%`} selected={percent === p} tone={last && p < Number(last.percent) ? 'muted' : undefined} onPress={() => setPercent(p)} />)}
            </View>
          </Field>
          <Card>
            <T.h2>{t('report.photos')}</T.h2>
            <Row style={{ flexWrap: 'wrap' }}>
              {photos.map((p) => <PhotoThumb key={p.id} photo={p} />)}
              <Button kind="secondary" small label={photos.length ? t('photo.another') : t('photo.take')} onPress={() => void takePhoto(siteId!, 'progress', entryId).then((p) => p && setPhotos((x) => [...x, p]))} />
            </Row>
          </Card>
          <TextField label={t('report.note')} value={note} onChange={setNote} multiline placeholder={t('progress.voiceHint')} />
          <Button label={t('common.save')} disabled={!workItemId || percent === null} onPress={saveEntry} />
        </>
      )}
    </Screen>
  );
}
