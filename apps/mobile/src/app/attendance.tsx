import { addDays, isoDate } from '@site-diary/shared';
import { colors, spacing } from '@site-diary/ui-tokens';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { PhotoThumb } from '../components/Photo';
import { Banner, Button, Card, Chip, Field, Row, Screen, Stepper, T } from '../components/ui';
import { db, useDb, type Row as DbRow } from '../lib/db';
import { done, notice, useSite } from '../lib/hooks';
import { useName, useT } from '../lib/i18n';
import { takePhoto } from '../lib/photos';

type Line = { key: string; id?: string; contractorId: string; skillId: string; count: number; halfDayCount: number; otHours: number; fromYesterday?: boolean };

// M4: contractor × skill steppers, defaults = yesterday's numbers, one group photo with time and place.
export default function Attendance() {
  // The form starts from today's or the last day's numbers, so it waits until the phone's copy is loaded.
  const ready = useDb(() => db.ready);
  if (!ready) return <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;
  return <AttendanceForm />;
}

function AttendanceForm() {
  const t = useT();
  const name = useName();
  const { siteId } = useSite();
  const today = isoDate();
  const contractors = useDb(() => db.rows('contractor'));
  const skills = useDb(() => db.rows('skill').sort((a, b) => Number(a.sort) - Number(b.sort)));
  const pending = useDb(() => db.pending);

  const initial = useMemo<Line[]>(() => {
    const rows = db.rows('attendanceEntry').filter((r) => r.projectId === siteId);
    const todays = rows.filter((r) => r.date === today);
    if (todays.length) return todays.map((r) => ({ key: `${r.contractorId}:${r.skillId}`, id: r.id, contractorId: String(r.contractorId), skillId: String(r.skillId), count: Number(r.count), halfDayCount: Number(r.halfDayCount), otHours: Number(r.otHours) }));
    // No entry yet: start from the most recent day in the last week.
    for (let back = 1; back <= 7; back++) {
      const d = addDays(today, -back);
      const prev = rows.filter((r) => r.date === d);
      if (prev.length) return prev.map((r) => ({ key: `${r.contractorId}:${r.skillId}`, contractorId: String(r.contractorId), skillId: String(r.skillId), count: Number(r.count), halfDayCount: 0, otHours: 0, fromYesterday: true }));
    }
    return [];
  }, [siteId, today]);
  const [lines, setLines] = useState<Line[]>(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ contractorId?: string } | null>(lines.length ? null : {});
  const [photo, setPhoto] = useState<DbRow | null>(() => {
    const id = db.rows('attendanceEntry').find((r) => r.projectId === siteId && r.date === today && r.photoId)?.photoId as string | undefined;
    return id ? db.find('photo', id) ?? null : null;
  });

  const set = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch, fromYesterday: false } : l)));
  const total = lines.reduce((s, l) => s + l.count + l.halfDayCount, 0);
  const byContractor = contractors.filter((c) => lines.some((l) => l.contractorId === c.id));

  const save = () => {
    if (!siteId) return;
    for (const l of lines) {
      if (!l.id && l.count + l.halfDayCount === 0 && l.otHours === 0) continue;
      db.save('attendanceEntry', {
        ...(l.id && { id: l.id }), projectId: siteId, date: today, contractorId: l.contractorId, skillId: l.skillId,
        count: l.count, halfDayCount: l.halfDayCount, otHours: l.otHours, photoId: photo?.id ?? null, recordedOn: isoDate(),
      });
    }
    notice(t('common.saved'), t('attendance.savedHint', { count: total }));
    done();
  };

  const addPhoto = async () => {
    if (!siteId) return;
    const day = db.rows('siteDay').find((r) => r.projectId === siteId && r.date === today) ?? db.save('siteDay', { projectId: siteId, date: today, marker: 'work', note: null });
    const p = await takePhoto(siteId, 'attendance', day.id);
    if (p) setPhoto(p);
  };

  return (
    <Screen
      title={t('home.attendance')}
      footer={<Button label={`${t('common.save')} · ${t('attendance.workers', { count: total })}`} onPress={save} disabled={!lines.length} />}
    >
      {lines.some((l) => l.fromYesterday) ? <Banner tone="info" text={t('attendance.fromYesterday')} /> : null}
      {lines.some((l) => l.id && pending.has(l.id)) ? <Banner text={t('attendance.waitingApproval')} /> : null}
      {byContractor.map((c) => (
        <Card key={c.id}>
          <T.h2>{String(c.name)}</T.h2>
          {lines.filter((l) => l.contractorId === c.id).map((l) => (
            <View key={l.key} style={{ gap: spacing.sm, paddingVertical: spacing.xs }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Pressable onPress={() => setOpen(open === l.key ? null : l.key)} hitSlop={6} style={{ flex: 1 }}>
                  <T.body bold color={l.fromYesterday ? colors.muted : undefined}>{name(skills.find((s) => s.id === l.skillId))}</T.body>
                  <T.small>{l.halfDayCount || l.otHours ? `${t('attendance.halfDay')} ${l.halfDayCount} · OT ${l.otHours}` : t('attendance.more')}</T.small>
                </Pressable>
                <Stepper label={name(skills.find((s) => s.id === l.skillId))} value={l.count} onChange={(v) => set(l.key, { count: v })} />
              </Row>
              {open === l.key && (
                <View style={{ gap: spacing.sm, paddingLeft: spacing.md }}>
                  <Row style={{ justifyContent: 'space-between' }}><T.body>{t('attendance.halfDay')}</T.body><Stepper label={t('attendance.halfDay')} value={l.halfDayCount} onChange={(v) => set(l.key, { halfDayCount: v })} /></Row>
                  <Row style={{ justifyContent: 'space-between' }}><T.body>{t('attendance.overtime')}</T.body><Stepper label={t('attendance.overtime')} value={l.otHours} step={1} max={999} onChange={(v) => set(l.key, { otHours: v })} /></Row>
                </View>
              )}
            </View>
          ))}
        </Card>
      ))}

      {adding ? (
        <Card>
          <Field label={adding.contractorId ? t('attendance.pickSkill') : t('attendance.pickContractor')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {!adding.contractorId
                ? contractors.map((c) => <Chip key={c.id} label={String(c.name)} onPress={() => setAdding({ contractorId: c.id })} />)
                : skills.filter((s) => !lines.some((l) => l.contractorId === adding.contractorId && l.skillId === s.id)).map((s) => (
                    <Chip key={s.id} label={name(s)} onPress={() => {
                      setLines((ls) => [...ls, { key: `${adding.contractorId}:${s.id}`, contractorId: adding.contractorId!, skillId: s.id, count: 0, halfDayCount: 0, otHours: 0 }]);
                      setAdding(null);
                    }} />
                  ))}
            </View>
          </Field>
          {!contractors.length ? <T.small>{t('attendance.noContractors')}</T.small> : null}
          <Button kind="ghost" small label={t('common.cancel')} onPress={() => setAdding(null)} />
        </Card>
      ) : (
        <Button kind="secondary" label={t('attendance.addRow')} onPress={() => setAdding({})} />
      )}

      <Card>
        <T.h2>{t('attendance.groupPhoto')}</T.h2>
        <T.small>{t('attendance.photoHint')}</T.small>
        <Row>
          {photo ? <PhotoThumb photo={photo} size={120} /> : null}
          <Button kind="secondary" small label={photo ? t('photo.retake') : t('photo.take')} onPress={() => void addPhoto()} />
        </Row>
      </Card>
    </Screen>
  );
}
