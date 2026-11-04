import { formatNumber, formatPaise, isoDate, shortDate } from '@site-diary/shared';
import { colors, spacing } from '@site-diary/ui-tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Banner, Button, Card, Chips, Empty, flush, Icon, Input, ListRow, Pill, Row, Screen, Section, T, Text } from '../components/ui';
import { post, put } from '../lib/api';
import { db, useDb } from '../lib/db';
import { confirm, useCan, useOnline } from '../lib/hooks';
import { useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { useSave, type Book } from '../lib/setup';

type Draft = { id: string; name: string; percent: string };

// A site's payment plan for flat buyers (construction-linked): each stage a share of the deal. When a stage is
// done, the owner taps "Done" and every sold flat's instalment for it falls due; the flats list shows who owes.
export default function Stages() {
  const t = useT();
  const can = useCan();
  const { me } = useSession();
  const params = useLocalSearchParams<{ site?: string }>();
  const sites = me?.projects.filter((p) => p.status === 'active') ?? [];
  const [site, setSite] = useState<string | null>(params.site ?? (sites.length === 1 ? sites[0]!.id : null));
  const { data, error, reload } = useOnline<Book>(site ? `/accounts?projectId=${site}` : null);
  const write = can('accounts', 'C');
  const { busy, run } = useSave();
  const [draft, setDraft] = useState<Draft[] | null>(null);
  const floors = useDb(() => db.rows('structureNode').filter((n) => n.projectId === site && n.kind === 'floor').length);
  const stages = (data?.stages ?? []).filter((s) => s.projectId === site);
  const sold = (data?.units ?? []).filter((u) => u.projectId === site && u.dealPaise != null);
  const dueNow = sold.filter((u) => u.schedule.dueNowPaise);
  // What a stage brings in from every sold flat.
  const stageTotal = (id: string) => sold.reduce((x, u) => x + (u.schedule.stages.find((s) => s.id === id)?.amountPaise ?? 0), 0);

  const edit = () => setDraft(stages.map((s) => ({ id: s.id, name: s.name, percent: formatNumber(s.percent, 2) })));
  // Booking, plinth, a slab per floor, brickwork, plaster, possession: 100% in all, changed as the builder likes.
  const usual = () => {
    const slabs = Math.min(15, Math.max(1, floors));
    const each = Math.floor((50 / slabs) * 100) / 100;
    setDraft([
      { name: t('stage.booking'), percent: '10' },
      { name: t('stage.plinth'), percent: '10' },
      ...Array.from({ length: slabs }, (_, i) => ({ name: t('stage.slab', { n: i + 1 }), percent: String(i === slabs - 1 ? Math.round((50 - each * (slabs - 1)) * 100) / 100 : each) })),
      { name: t('stage.brickwork'), percent: '10' },
      { name: t('stage.plaster'), percent: '10' },
      { name: t('stage.possession'), percent: '10' },
    ].map((d) => ({ ...d, id: randomUUID() })));
  };
  const total = (draft ?? []).reduce((x, d) => x + (Number(d.percent) || 0), 0);
  const valid = !!draft && draft.every((d) => d.name.trim() && Number(d.percent) > 0) && total <= 100.001;
  const set = (id: string, patch: Partial<Draft>) => setDraft((ds) => (ds ?? []).map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const save = () => void run(async () => {
    await put('/accounts/stages', { projectId: site, stages: (draft ?? []).map((d) => ({ id: d.id, name: d.name.trim(), percent: Number(d.percent) })) });
    setDraft(null);
    await reload();
  });
  const reach = async (s: (typeof stages)[number]) => {
    if (s.reachedOn) {
      if (!(await confirm(t('stages.unreachQ', { stage: s.name }), '', t('common.saveChange'), t('common.cancel')))) return;
    } else {
      const amount = formatPaise(stageTotal(s.id));
      if (!(await confirm(t('stages.reachQ', { stage: s.name }), t('stages.reachBody', { count: sold.length, amount }), t('stages.reach'), t('common.cancel')))) return;
    }
    if (await run(async () => void (await post(`/accounts/stages/${s.id}/reached`, { date: s.reachedOn ? null : isoDate() })))) void reload();
  };

  if (draft) {
    return (
      <Screen
        title={t('stages.edit')}
        subtitle={sites.find((p) => p.id === site)?.name}
        footer={
          <>
            <T.body bold color={Math.abs(total - 100) < 0.01 ? colors.success : colors.warning}>{Math.abs(total - 100) < 0.01 ? t('stages.total', { percent: formatNumber(total, 2) }) : t('stages.totalWarn', { percent: formatNumber(total, 2) })}</T.body>
            <Row>
              <Button style={{ flex: 1 }} kind="secondary" label={t('common.cancel')} onPress={() => setDraft(null)} />
              <Button style={{ flex: 1 }} icon="check" label={t('common.save')} busy={busy} disabled={!valid} onPress={save} />
            </Row>
          </>
        }
      >
        {!draft.length ? <Button kind="secondary" icon="auto-fix" label={t('stages.template')} onPress={usual} /> : null}
        <Card style={flush}>
          {draft.map((d, i) => (
            <View key={d.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <Input style={{ flex: 1, minWidth: 0 }} value={d.name} onChangeText={(v) => set(d.id, { name: v })} placeholder={t('stages.name')} accessibilityLabel={t('stages.name')} maxLength={60} />
              <Input style={{ width: 76, textAlign: 'right', fontWeight: '700' }} value={d.percent} onChangeText={(v) => set(d.id, { percent: v.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad" placeholder="%" accessibilityLabel="%" />
              <Text style={{ fontSize: 16, color: colors.muted }}>%</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={t('setup.remove')} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }} onPress={() => setDraft(draft.filter((x) => x.id !== d.id))}>
                <Icon name="trash-can-outline" size={22} color={colors.danger} />
              </Pressable>
            </View>
          ))}
        </Card>
        <Button kind="secondary" icon="plus" label={t('stages.add')} onPress={() => setDraft([...draft, { id: randomUUID(), name: '', percent: '' }])} />
      </Screen>
    );
  }

  return (
    <Screen title={t('stages.title')} subtitle={sites.find((p) => p.id === site)?.name} footer={write && site ? <Button kind="secondary" icon="pencil-outline" label={t('stages.edit')} onPress={edit} /> : undefined}>
      {sites.length > 1 ? <Chips<string> options={sites.map((p) => ({ value: p.id, label: p.name }))} value={site} onChange={setSite} /> : null}
      {!site ? <Empty icon="office-building-outline" text={t('stages.pickSite')} /> : null}
      {error ? <Banner tone="error" text={error === 'offline' ? t('common.offlineOnline') : error} onPress={() => void reload()} /> : null}
      {site && data ? (
        <>
          <Banner tone="info" text={t('stages.hint')} />
          {!stages.length ? (
            write ? <Empty icon="stairs-up" text={t('stages.empty')} action={t('stages.template')} onAction={() => { usual(); }} /> : <Empty icon="stairs-up" text={t('stages.empty')} />
          ) : (
            <Card style={flush}>
              {stages.map((s, i) => (
                <View key={s.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T.body bold>{s.name} · {formatNumber(s.percent, 2)}%</T.body>
                    {sold.length ? <T.small>{formatPaise(stageTotal(s.id))}</T.small> : null}
                  </View>
                  {s.reachedOn ? (
                    <Pressable disabled={!write} accessibilityRole="button" accessibilityLabel={t('stages.unreachQ', { stage: s.name })} onPress={() => void reach(s)}>
                      <Pill tone="ok" label={`✓ ${t('stages.reachedOn', { date: shortDate(s.reachedOn) })}`} />
                    </Pressable>
                  ) : write ? (
                    <Button small kind="secondary" label={t('stages.reach')} onPress={() => void reach(s)} />
                  ) : null}
                </View>
              ))}
            </Card>
          )}
          {dueNow.length ? (
            <>
              <Section title={t('stages.dueList')} />
              <Card style={flush}>
                {dueNow.map((u, i) => (
                  <ListRow key={u.id} icon="home-city-outline" tone="warn" title={u.name} detail={u.buyerName ?? undefined} value={formatPaise(u.schedule.dueNowPaise ?? 0)} valueTone="warn" onPress={() => router.push({ pathname: '/unit', params: { id: u.id } })} last={i === dueNow.length - 1} />
                ))}
              </Card>
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
