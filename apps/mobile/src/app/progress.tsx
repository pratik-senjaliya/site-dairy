import { isoDate, shortDate } from '@site-diary/shared';
import { spacing } from '@site-diary/ui-tokens';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { View } from 'react-native';
import { PhotoThumb } from '../components/Photo';
import { byUse, QuickAdd, RowChips, TextField } from '../components/pickers';
import { TodayEntries } from '../components/TodayEntries';
import { Ask, Button, Chip, Chips, DiaryLine, Row, Screen } from '../components/ui';
import { post } from '../lib/api';
import { db, useDb, type Row as DbRow } from '../lib/db';
import { done, notice, useSite } from '../lib/hooks';
import { useName, useT } from '../lib/i18n';
import { takePhoto } from '../lib/photos';
import { floorName } from '../lib/structure';
import { useDiary } from '../lib/diary';

type Marker = 'work' | 'weather' | 'holiday' | 'no_work';

// M9: today's work, as the site diary: did work go on (or rain / holiday), which work on which floor,
// how complete it is now, photos and a note (the keyboard's mic button types Gujarati speech).
export default function Progress() {
  const t = useT();
  const name = useName();
  const { siteId } = useSite();
  const today = isoDate();
  // Work items in template order, the ones this site works on now first.
  const items = useDb(() => byUse(
    db.rows('workItem').filter((w) => w.projectId === siteId).sort((a, b) => Number(a.sort) - Number(b.sort)),
    [...db.rows('dailyProgress'), ...db.rows('materialIssue')].filter((r) => r.projectId === siteId).map((r) => r.workItemId),
  ));
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

  // Last % for this work item and floor (not today's), so the supervisor only moves it forward.
  const last = useDb(() => db.rows('dailyProgress').filter((p) => p.workItemId === workItemId && (p.structureNodeId ?? null) === nodeId && p.date !== today && p.id !== entryId).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]);

  const line = useDiary().progress;

  // A work item usually continues on the floor it was on last time.
  const pickItem = (id: string | null) => {
    setItem(id);
    const prev = db.rows('dailyProgress').filter((p) => p.projectId === siteId && p.workItemId === id).sort((x, y) => String(y.date).localeCompare(String(x.date)))[0];
    if (prev) setNode((prev.structureNodeId as string | null) ?? null);
  };

  const saveEntry = () => {
    if (!siteId || !workItemId || percent === null) return;
    if (siteDay && siteDay.marker !== 'work') db.save('siteDay', { id: siteDay.id, projectId: siteId, date: today, marker: 'work', note: siteDay.note ?? null });
    db.save('dailyProgress', { id: entryId, projectId: siteId, date: today, workItemId, structureNodeId: nodeId, percent, note: note || null });
    setEntryId(randomUUID());
    setItem(null);
    setPhotos([]);
    setNote('');
    setPercent(null);
    notice(t('progress.savedNext'));
  };
  // Fixing a mistake: today's entry goes back into the form (its photos stay with it).
  const edit = (id: string) => {
    const e = db.find('dailyProgress', id);
    if (!e) return;
    setEntryId(id);
    setItem(String(e.workItemId));
    setNode((e.structureNodeId as string | null) ?? null);
    setPercent(Number(e.percent));
    setNote(String(e.note ?? ''));
    setPhotos(db.rows('photo').filter((p) => p.sourceId === id));
  };
  const saveDay = () => {
    db.save('siteDay', { ...(siteDay && { id: siteDay.id }), projectId: siteId, date: today, marker, note: dayNote || null });
    notice(t('common.saved'));
    done();
  };

  const dayText = `${t('progress.dayLine', { marker: t(`marker.${marker}`) })}${dayNote ? ` — ${dayNote}` : ''}`;
  const entryText = workItemId && percent !== null
    ? `${line({ workItemId, structureNodeId: nodeId, percent })}${last && Number(last.percent) !== percent ? t('progress.wasBefore', { percent: Number(last.percent) }) : ''}`
    : null;

  return (
    <Screen
      title={t('home.progress')}
      footer={marker !== 'work' ? (
        <>
          <DiaryLine text={dayText} />
          <Button label={t('common.save')} onPress={saveDay} />
        </>
      ) : (
        <>
          {entryText ? <DiaryLine text={entryText} /> : null}
          <Button label={t('common.save')} disabled={!entryText} onPress={saveEntry} />
        </>
      )}
    >
      <Ask q={t('progress.qDay')}>
        <Chips<Marker> options={(['work', 'weather', 'holiday', 'no_work'] as const).map((m) => ({ value: m, label: m === 'work' ? t('progress.yesWork') : t(`marker.${m}`) }))} value={marker} onChange={setMarker} />
      </Ask>
      {marker !== 'work' ? (
        <TextField label={t('progress.qWhy')} value={dayNote} onChange={setDayNote} multiline placeholder={t('progress.voiceHint')} />
      ) : (
        <>
          <TodayEntries editing={entryId} onEdit={edit} entries={entries.map((e) => ({ id: e.id, table: 'dailyProgress' as const, label: line(e) }))} />
          <Ask q={t('progress.qItem')}>
            <RowChips label="" rows={items} max={8} value={workItemId} onChange={pickItem} nameOf={name} />
            <QuickAdd label={t('progress.newItem')} placeholder="Waterproofing" onAdd={async (n) => {
              const w = await post<{ id: string }>('/masters/workItem', { projectId: siteId, nameGu: n, nameEn: n, sort: items.length });
              await db.sync();
              pickItem(w.id);
            }} />
          </Ask>
          {workItemId ? (
            <>
              <Ask q={t('used.onFloor')}>
                <RowChips label="" rows={floors} value={nodeId} onChange={setNode} nameOf={(r) => floorName(r)} allowNone noneLabel={t('common.notSure')} />
                <QuickAdd label={t('progress.newPlace')} placeholder="Terrace" onAdd={async (n) => {
                  const tower = db.rows('structureNode').find((x) => x.projectId === siteId && x.kind === 'tower');
                  const f = await post<{ id: string }>('/masters/structureNode', { projectId: siteId, parentId: tower?.id ?? null, kind: 'floor', name: n, sort: floors.length + 100 });
                  await db.sync();
                  setNode(f.id);
                }} />
              </Ask>
              <Ask q={t('progress.qPercent')} hint={`${t('progress.percentHint')}${last ? ` ${t('progress.last', { percent: Number(last.percent), date: shortDate(String(last.date)) })}` : ''}`}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((p) => <Chip key={p} label={`${p}%`} selected={percent === p} tone={last && p < Number(last.percent) ? 'muted' : undefined} onPress={() => setPercent(p)} />)}
                </View>
              </Ask>
              <Ask q={t('report.photos')} optional>
                <Row style={{ flexWrap: 'wrap' }}>
                  {photos.map((p) => <PhotoThumb key={p.id} photo={p} />)}
                  <Button kind="secondary" small label={photos.length ? t('photo.another') : t('photo.take')} onPress={() => void takePhoto(siteId!, 'progress', entryId).then((p) => p && setPhotos((x) => [...x, p]))} />
                </Row>
              </Ask>
              <Ask q={t('progress.qNote')} optional>
                <TextField label="" value={note} onChange={setNote} multiline placeholder={t('progress.voiceHint')} />
              </Ask>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
