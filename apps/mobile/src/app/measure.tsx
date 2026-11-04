import { formatNumber, formatPaise, isoDate, measureAmount, paysByDay, shortDate, WORK_UNITS, type WorkUnit } from '@site-diary/shared';
import { colors, spacing } from '@site-diary/ui-tokens';
import { useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { byUse, DayStep, RowChips } from '../components/pickers';
import { Ask, Banner, Button, Card, Chip, Chips, DiaryLine, Empty, flush, Icon, Input, Row, Screen, Section, Segmented, T, Text } from '../components/ui';
import { del, post } from '../lib/api';
import { db, useDb } from '../lib/db';
import { confirm, done, notice, useCan, useOnline, useSite } from '../lib/hooks';
import { useT } from '../lib/i18n';
import { takePhoto } from '../lib/photos';
import { useSession } from '../lib/session';
import { useContractorName, useSave } from '../lib/setup';
import { floorName } from '../lib/structure';

export interface WorkData {
  works: { id: string; contractorId: string; name: string; unit: WorkUnit; ratePaise: number | null }[];
  measures: { id: string; workId: string; contractorId: string; date: string; qty: number; place: string | null; note: string | null; ratePaise: number | null; amountPaise: number | null; billed: boolean; by: string | null; byId: string | null }[];
}

/** "2,450 sq ft" */
export function useQtyText() {
  const t = useT();
  return (qty: number, unit: string) => `${formatNumber(qty)} ${(WORK_UNITS as readonly string[]).includes(unit) ? t(`workUnit.${unit}` as 'workUnit.sqft') : unit}`;
}

/** Typed numbers: "2,450.5" → 2450.5 */
const num = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0;

// Contract work measured on site: centering per sq ft after a slab, plaster per sq ft, brickwork… Whoever writes
// upad can write a measurement; the office sets the work and its rate. It is billed in the contractor's hisab.
export default function Measure() {
  const t = useT();
  const can = useCan();
  const { me } = useSession();
  const { siteId: current } = useSite();
  const params = useLocalSearchParams<{ contractor?: string; site?: string }>();
  const sites = me?.projects.filter((p) => p.status === 'active') ?? [];
  const [siteId, setSiteId] = useState<string | null>(params.site || current || sites[0]?.id || null);
  const money = can('wages', 'V');
  const office = ['owner', 'engineer', 'accountant'].includes(me?.user.role ?? '');
  const contractorName = useContractorName();
  const qtyText = useQtyText();
  const { data, error, reload } = useOnline<WorkData>(siteId ? `/work?projectId=${siteId}` : null);
  // Contractors paid by measurement first, then the ones who work here most.
  const contractors = useDb(() => byUse(db.rows('contractor'), db.rows('attendanceEntry').filter((a) => a.projectId === siteId).map((a) => a.contractorId))
    .sort((a, b) => Number(paysByDay(a.rateType as string)) - Number(paysByDay(b.rateType as string))));
  const floors = useDb(() => db.rows('structureNode').filter((n) => n.projectId === siteId && n.kind === 'floor').sort((a, b) => Number(a.sort) - Number(b.sort)).map(floorName));
  const [contractorId, setContractor] = useState<string | null>(params.contractor ?? null);
  const contractor = useDb(() => (contractorId ? db.find('contractor', contractorId) : undefined));
  const works = (data?.works ?? []).filter((w) => w.contractorId === contractorId);
  const [workId, setWorkId] = useState<string | null>(null);
  const work = works.find((w) => w.id === workId) ?? (works.length === 1 ? works[0] : undefined);
  const [place, setPlace] = useState('');
  const [qty, setQty] = useState('');
  const [lw, setLw] = useState(false);
  const [len, setLen] = useState('');
  const [wid, setWid] = useState('');
  const [date, setDate] = useState(isoDate());
  const [id] = useState(randomUUID);
  const [photo, setPhoto] = useState(false);
  const { busy, run } = useSave();

  // A new kind of work and its rate (office only).
  const [adding, setAdding] = useState(false);
  const [workName, setWorkName] = useState('');
  const [unit, setUnit] = useState<WorkUnit>('sqft');
  const [rate, setRate] = useState('');
  const suggestions = useMemo(() => {
    const key = `work.suggest.${String(contractor?.trade ?? '')}`;
    const text = t(key as 'work.suggest.Civil');
    return text === key ? [] : text.split('|');
  }, [contractor?.trade, t]);

  const amount = lw ? Math.round(num(len) * num(wid) * 100) / 100 : num(qty);
  const mine = (data?.measures ?? []).filter((m) => m.contractorId === contractorId);
  const open = mine.filter((m) => !m.billed);
  const workOf = (wid: string) => data?.works.find((w) => w.id === wid);
  const line = (w: { name: string; unit: string }, q: number, where: string) =>
    where ? t('measure.will', { contractor: contractorName(contractor), work: w.name, qty: qtyText(q, w.unit), place: where }) : t('measure.willNoPlace', { contractor: contractorName(contractor), work: w.name, qty: qtyText(q, w.unit) });

  const addWork = () => void run(async () => {
    const r = await post<{ id: string }>('/work', { id: randomUUID(), projectId: siteId, contractorId, name: workName.trim(), unit, ratePaise: Math.round(num(rate) * 100) });
    await reload();
    setWorkId(r.id);
    setAdding(false);
    setWorkName('');
    setRate('');
  });
  const save = () => void run(async () => {
    await post('/work/measures', { id, workId: work!.id, date, qty: amount, place: place.trim() || null });
    notice(t('common.saved'));
    done();
  });
  const remove = async (m: WorkData['measures'][number]) => {
    const w = workOf(m.workId);
    if (!(await confirm(t('measure.removeQ'), w ? line(w, m.qty, m.place ?? '') : '', t('accounts.removeOk'), t('common.cancel')))) return;
    if (await run(async () => void (await del(`/work/measures/${m.id}`)))) void reload();
  };
  const snap = async () => {
    if (!siteId) return;
    const row = await takePhoto(siteId, 'measure', id);
    if (row) setPhoto(true);
  };

  const ok = !!work && amount > 0 && !!siteId;
  return (
    <Screen
      title={t('measure.title')}
      footer={
        <>
          {ok ? <DiaryLine text={`${line(work, amount, place.trim())}${money && work.ratePaise ? ` · ${formatPaise(measureAmount(amount, work.ratePaise))}` : ''}`} /> : null}
          <Button icon="check" label={t('common.save')} busy={busy} disabled={!ok} onPress={save} />
        </>
      }
    >
      {error ? <Banner tone="error" text={error === 'offline' ? t('common.offlineOnline') : error} onPress={() => void reload()} /> : null}
      {!params.site && sites.length > 1 ? <Chips<string> options={sites.map((p) => ({ value: p.id, label: p.name }))} value={siteId} onChange={(v) => { setSiteId(v); setWorkId(null); }} /> : null}
      <Ask q={t('measure.qContractor')}>
        <RowChips label="" rows={contractors} max={8} value={contractorId} onChange={(c) => { setContractor(c); setWorkId(null); setAdding(false); }} nameOf={contractorName} blank />
      </Ask>

      {contractorId && data ? (
        <Ask q={t('measure.qWork')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {works.map((w) => (
              <Chip key={w.id} label={`${w.name}${w.ratePaise != null ? ` · ${formatPaise(w.ratePaise)}/${t(`workUnit.${w.unit}`)}` : ''}`} selected={work?.id === w.id} onPress={() => setWorkId(w.id)} />
            ))}
            {office && !adding ? <Chip icon="plus" label={t('measure.newWork')} tone="muted" onPress={() => setAdding(true)} /> : null}
          </View>
          {!works.length && !office ? <Banner tone="info" text={t('measure.noWork')} /> : null}
          {adding ? (
            <Card style={{ gap: spacing.md }}>
              <T.body bold>{t('measure.newWork')}</T.body>
              {suggestions.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {suggestions.map((s) => <Chip key={s} label={s} selected={workName === s} onPress={() => setWorkName(s)} />)}
                </View>
              ) : null}
              <Input value={workName} onChangeText={setWorkName} placeholder={suggestions[0] ?? t('measure.qWorkName')} accessibilityLabel={t('measure.qWorkName')} maxLength={80} />
              <T.small>{t('measure.qUnit')}</T.small>
              <Chips<WorkUnit> options={WORK_UNITS.map((u) => ({ value: u, label: t(`workUnit.${u}`) }))} value={unit} onChange={setUnit} />
              <Row>
                <View style={{ flex: 1 }}><T.body>{t('measure.qRate', { unit: t(`workUnit.${unit}`) })}</T.body></View>
                <Input value={rate} onChangeText={(v) => setRate(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="₹" accessibilityLabel={t('measure.qRate', { unit: t(`workUnit.${unit}`) })} style={{ width: 120, textAlign: 'right', fontSize: 20, fontWeight: '700' }} />
              </Row>
              <Row>
                <Button style={{ flex: 1 }} small kind="secondary" label={t('common.cancel')} onPress={() => setAdding(false)} />
                <Button style={{ flex: 1 }} small icon="plus" label={t('measure.saveWork')} busy={busy} disabled={!workName.trim() || !num(rate)} onPress={addWork} />
              </Row>
            </Card>
          ) : null}
        </Ask>
      ) : null}

      {work ? (
        <>
          <Ask q={t('measure.qPlace')} optional hint={t('measure.placeHint')}>
            {floors.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {floors.map((f) => <Chip key={f} label={f} selected={place === f} onPress={() => setPlace(place === f ? '' : f)} />)}
              </View>
            ) : null}
            <Input value={place} onChangeText={setPlace} placeholder="Floor 3 slab" accessibilityLabel={t('measure.qPlace')} maxLength={80} />
          </Ask>
          <Ask q={t('measure.qQty')}>
            {work.unit !== 'lump' && work.unit !== 'nos' && work.unit !== 'kg' ? (
              <Segmented<'qty' | 'lw'> options={[{ value: 'qty', label: t(`workUnit.${work.unit}`) }, { value: 'lw', label: t('measure.lw') }]} value={lw ? 'lw' : 'qty'} onChange={(v) => setLw(v === 'lw')} />
            ) : null}
            {lw ? (
              <Row style={{ alignItems: 'center' }}>
                <Input style={{ flex: 1, minWidth: 0, fontSize: 22, textAlign: 'center' }} value={len} onChangeText={setLen} keyboardType="decimal-pad" placeholder={t('measure.length')} accessibilityLabel={t('measure.length')} />
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.muted }}>×</Text>
                <Input style={{ flex: 1, minWidth: 0, fontSize: 22, textAlign: 'center' }} value={wid} onChangeText={setWid} keyboardType="decimal-pad" placeholder={t('measure.width')} accessibilityLabel={t('measure.width')} />
              </Row>
            ) : (
              <Row style={{ alignItems: 'center' }}>
                <Input style={{ flex: 1, minWidth: 0, fontSize: 24, fontWeight: '700' }} value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder="0" accessibilityLabel={t('measure.qQty')} />
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>{t(`workUnit.${work.unit}`)}</Text>
              </Row>
            )}
            {lw && amount ? <Banner tone="ok" text={`= ${qtyText(amount, work.unit)}`} /> : null}
          </Ask>
          <Ask q={t('measure.qDate')}>
            <DayStep value={date} onChange={setDate} />
          </Ask>
          <Button kind="secondary" icon={photo ? 'check' : 'camera'} label={photo ? t('measure.photoTaken') : t('measure.photo')} onPress={() => void snap()} />
        </>
      ) : null}

      {contractorId && data ? (
        <>
          <Section title={t('measure.list')} />
          {money && open.some((m) => m.amountPaise) ? <Banner tone="warn" text={t('measure.unbilled', { amount: formatPaise(open.reduce((s, m) => s + (m.amountPaise ?? 0), 0)) })} /> : null}
          {!mine.length ? <Empty icon="ruler-square" text={t('measure.none')} /> : (
            <Card style={flush}>
              {mine.map((m, i) => {
                const w = workOf(m.workId);
                const removable = !m.billed && (m.byId === me?.user.id || office);
                return (
                  <View key={m.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <T.body bold>{w?.name ?? ''} · {qtyText(m.qty, w?.unit ?? '')}</T.body>
                      <T.small>{[shortDate(m.date), m.place, t('accounts.by', { name: m.by ?? '—' })].filter(Boolean).join(' · ')}</T.small>
                      <T.small color={m.billed ? colors.success : colors.warning} bold>{m.billed ? `✓ ${t('measure.billed')}` : t('measure.open')}</T.small>
                    </View>
                    {m.amountPaise != null ? <T.body bold>{formatPaise(m.amountPaise)}</T.body> : null}
                    {removable ? (
                      <Pressable accessibilityRole="button" accessibilityLabel={t('measure.removeQ')} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }} onPress={() => void remove(m)}>
                        <Icon name="trash-can-outline" size={22} color={colors.danger} />
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          )}
        </>
      ) : null}
    </Screen>
  );
}
