import { noticeText, type Notice } from '@site-diary/i18n';
import { formatNumber, formatPaise, shortDate, wageWeek } from '@site-diary/shared';
import { colors, radius, spacing } from '@site-diary/ui-tokens';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Bell, DiaryLines, FieldHome, openTel } from '../components/FieldHome';
import { SyncBadge } from '../components/SyncBadge';
import { Banner, Button, Card, flush, Icon, IconBadge, ListRow, Row, s, Screen, Section, Stat, T, Tile } from '../components/ui';
import { get, isDemo } from '../lib/api';
import { db, useDb } from '../lib/db';
import { daysSince, useDayPage, useDayPages, useDiary } from '../lib/diary';
import { useCan, useOnline } from '../lib/hooks';
import { useDayName, useName, useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { shareMessage } from '../lib/share';
import { awaitedMaterial, siteStock } from '../lib/stock';

interface Person { id: string; name: string; role: string; phone: string }
interface SiteToday {
  project: { id: string; name: string };
  labour: { workers: number; yesterday: number; changePct: number | null; costPaise: number; costMissingRates: boolean };
  missing: string[]; alerts: Notice[]; marker: string; team?: Person[];
}
interface Dashboard {
  date: string;
  totals: { workers: number; yesterday: number; labourCostPaise: number; pendingApprovals: number };
  sites: SiteToday[];
}

// M3 (field) / M12 (owner): one home that shows each role only its own jobs.
export default function Home() {
  const { me } = useSession();
  const role = me?.user.role;
  if (role === 'owner' || role === 'accountant') return <OfficeHome />;
  return <FieldHome />;
}

/** Week totals in whole rupees: the owner plans in rupees, the paise are in the hisab. */
const rupees = (paise: number) => formatPaise(Math.round(paise / 100) * 100);

/** What the next wage day will cost across the sites: labour so far this week less the upad already given. */
function useWageDay(siteIds: string[], enabled: boolean) {
  const { me } = useSession();
  const week = wageWeek(useDb(() => db.today), me?.company.settings.wageDay ?? 6);
  const [data, setData] = useState<{ gross: number; advances: number; net: number } | null>(null);
  const key = siteIds.join(',');
  const load = useCallback(async () => {
    if (!enabled || !key) return;
    try {
      const all = await Promise.all(key.split(',').map((id) => get<{ contractors: { gross: number; advances: number; net: number }[] }>(`/wages/summary?projectId=${id}&from=${week.from}&to=${week.to}`)));
      const rows = all.flatMap((x) => x.contractors);
      setData({ gross: rows.reduce((a, r) => a + r.gross, 0), advances: rows.reduce((a, r) => a + r.advances, 0), net: rows.reduce((a, r) => a + Math.max(0, r.net), 0) });
    } catch {
      // offline: the card waits for the next refresh
    }
  }, [enabled, key, week.from, week.to]);
  useEffect(() => void load(), [load]);
  return { week, data, reload: load };
}

const STEP_ICONS = ['numeric-1-circle-outline', 'numeric-2-circle-outline', 'numeric-3-circle-outline'] as const;

/** First days: the three things that make the app useful, ticked off as they are done. */
function GettingStarted({ people }: { people: number | null }) {
  const t = useT();
  const { me } = useSession();
  const contractors = useDb(() => db.rows('contractor').length);
  const steps = [
    { done: (me?.projects.length ?? 0) > 0, label: t('start.site'), go: () => router.push('/setup/site') },
    { done: contractors > 0, label: t('start.contractors'), go: () => router.push('/setup/contractors') },
    { done: (people ?? 0) > 1, label: t('start.people'), go: () => router.push({ pathname: '/setup/person', params: { role: 'supervisor' } }) },
  ];
  if (people === null || steps.every((x) => x.done)) return null;
  return (
    <Card style={{ ...flush, borderWidth: 2, borderColor: colors.primary }}>
      <View style={{ padding: spacing.lg, gap: spacing.xs, backgroundColor: colors.primarySoft }}>
        <T.h1>{t('start.title')}</T.h1>
        <T.body muted>{t('start.hint')}</T.body>
      </View>
      {steps.map((x, i) => (
        <ListRow key={i} icon={x.done ? 'check-circle' : STEP_ICONS[i]} tone={x.done ? 'ok' : 'primary'} title={x.label} onPress={x.done ? undefined : x.go} last={i === steps.length - 1} />
      ))}
    </Card>
  );
}

function OfficeHome() {
  const t = useT();
  const can = useCan();
  const dayName = useDayName();
  const name = useName();
  const diary = useDiary();
  const { me, lang } = useSession();
  const { data, error, reload } = useOnline<Dashboard>('/dashboard');
  const owner = me?.user.role === 'owner';
  const people = useOnline<{ id: string }[]>(owner ? '/users' : null);
  const sites = me?.projects.filter((p) => p.status === 'active') ?? [];
  const wages = useWageDay(sites.map((p) => p.id), can('wages', 'V'));
  const today = useDb(() => db.today);
  // Back on the home (after a settlement): the wage-day total again. (useOnline refreshes itself.)
  const seen = useRef(false);
  const reloadWages = wages.reload;
  useFocusEffect(useCallback(() => {
    if (seen.current) void reloadWages();
    seen.current = true;
  }, [reloadWages]));

  // Today across the sites as one message, for a partner or family on WhatsApp.
  const pages = useDayPages();
  const summary = () => [
    `*${me?.company.name ?? ''}* — ${dayName(today)}`,
    ...sites.map((p) => {
      const lines = pages(p.id, today);
      return [``, `*${p.name}*`, ...(lines.length ? lines.map((l) => `• ${l.text}`) : [t('owner.notWritten')])].join('\n');
    }),
  ].join('\n');

  // Things only the owner can sort out, from the sites' own entries (works offline).
  const attention = useDb(() => sites.flatMap((p) => [
    ...db.rows('issue').filter((i) => i.projectId === p.id && i.status === 'open' && daysSince(i.createdAt) >= 3)
      .map((i) => ({ key: i.id, site: p.id, icon: 'alert-circle-outline' as const, text: t('owner.oldIssue', { site: p.name, days: daysSince(i.createdAt), title: String(i.title) }) })),
    ...siteStock(p.id).filter((r) => r.soon || r.low).map((r) => ({
      key: `${p.id}:${r.materialId}`, site: p.id, icon: 'warehouse' as const,
      text: r.left?.days ? t('owner.stockSoon', { site: p.name, material: name(r.material), days: r.left.days }) : t('owner.stockLow', { site: p.name, material: name(r.material), qty: formatNumber(r.qty), unit: String(r.material?.unit ?? '') }),
    })),
    // Approved but not ordered yet: one tap to order it.
    ...db.rows('indent').filter((i) => i.projectId === p.id && i.status === 'approved').map((i) => ({
      key: `order:${i.id}`, site: p.id, icon: 'cart-arrow-right' as const, indent: i.id,
      text: t('order.toOrder', { site: p.name, items: db.rows('indentLine').filter((l) => l.indentId === i.id).map((l) => diary.material(l.materialId, l.qty)).join(', ') }),
    })),
    ...awaitedMaterial(p.id).filter((a) => a.late && a.ordered)
      .map((a) => ({ key: `${a.indentId}:${a.materialId}`, site: p.id, icon: 'truck-alert-outline' as const, text: t('owner.materialLate', { site: p.name, item: diary.material(a.materialId, a.qty), date: shortDate(a.neededBy) }) })),
  ]));

  return (
    <Screen back={false} title={me?.company.name ?? ''} subtitle={`${t('common.today')} · ${dayName(today)}`} right={<Row style={{ gap: 2 }}><SyncBadge /><Bell /></Row>}>
      {isDemo() ? <Banner tone="info" text={t('demo.banner')} onPress={() => router.push('/profile')} /> : null}
      {error && !data ? <Banner tone="error" text={error === 'offline' ? t('common.offlineOnline') : error} onPress={() => void reload()} /> : null}
      {owner ? <GettingStarted people={people.data?.length ?? null} /> : null}

      {data && sites.length ? (
        <Row style={{ gap: spacing.sm, alignItems: 'stretch' }}>
          <Stat value={data.totals.workers} label={t('owner.workersToday', { yesterday: data.totals.yesterday })} />
          {can('wages', 'V') ? <Stat value={rupees(data.totals.labourCostPaise)} label={t('owner.labourCost')} onPress={() => router.push('/hisab')} /> : null}
          <Stat value={data.totals.pendingApprovals} tone={data.totals.pendingApprovals ? 'primary' : undefined} label={t('home.approvals')} onPress={() => router.push('/approvals')} />
        </Row>
      ) : null}

      {data?.totals.pendingApprovals || attention.length ? (
        <Card style={flush}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm }}>
            <Icon name="bell-alert-outline" size={22} color={colors.warning} />
            <T.h2>{t('owner.needsYou')}</T.h2>
          </View>
          {data?.totals.pendingApprovals ? <ListRow icon="check-decagram-outline" title={t('owner.approvalsWaiting', { count: data.totals.pendingApprovals })} onPress={() => router.push('/approvals')} last={!attention.length} /> : null}
          {attention.slice(0, 8).map((a, i, all) => (
            <ListRow key={a.key} icon={a.icon} tone="warn" title={a.text} onPress={() => ('indent' in a && a.indent ? router.push({ pathname: '/order', params: { indent: a.indent } }) : router.push({ pathname: '/site', params: { id: a.site } }))} last={i === all.length - 1} />
          ))}
        </Card>
      ) : null}

      {can('wages', 'V') && wages.data && (wages.data.gross || wages.data.advances) ? (
        <Card onPress={() => router.push('/hisab')}>
          <Row>
            <IconBadge name="cash-multiple" tone="ok" size={44} />
            <View style={{ flex: 1 }}>
              <T.small>{t('owner.toPay', { day: dayName(wages.week.to) })}</T.small>
              <T.big>{rupees(wages.data.net)}</T.big>
              <T.small>{t('owner.toPayLine', { gross: rupees(wages.data.gross), advances: rupees(wages.data.advances) })}</T.small>
            </View>
            <Icon name="chevron-right" size={26} color={colors.faint} />
          </Row>
        </Card>
      ) : null}

      {sites.length ? <Section title={t('setup.sites')} action={owner ? `+ ${t('common.add')}` : undefined} onAction={() => router.push('/setup/site')} /> : null}
      {sites.map((p) => <SiteCard key={p.id} id={p.id} name={p.name} today={data?.sites.find((x) => x.project.id === p.id)} lang={lang} />)}

      {sites.length ? <Button kind="success" icon="whatsapp" label={t('owner.shareDay')} onPress={() => void shareMessage(summary())} /> : null}

      <Section title={t('home.more')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {can('wages', 'V') && <Tile compact icon="calculator-variant-outline" label={t('home.hisab')} onPress={() => router.push('/hisab')} />}
        <Tile compact icon="check-decagram-outline" label={t('home.approvals')} badge={data?.totals.pendingApprovals} onPress={() => router.push('/approvals')} />
        {can('po', 'V') ? <Tile compact icon="truck-outline" label={t('supplier.title')} onPress={() => router.push('/suppliers')} /> : null}
        <Tile compact icon="file-chart-outline" label={t('home.reports')} onPress={() => router.push('/reports')} />
        {owner ? <Tile compact icon="cog-outline" label={t('setup.title')} onPress={() => router.push('/setup')} /> : null}
        <Tile compact icon="account-circle-outline" label={t('home.profile')} onPress={() => router.push('/profile')} />
      </View>
    </Screen>
  );
}

/** One site on the owner's home: its diary page for today, as the supervisor wrote it, and a way in. */
function SiteCard({ id, name, today, lang }: { id: string; name: string; today?: SiteToday; lang: Parameters<typeof noticeText>[0] }) {
  const t = useT();
  const can = useCan();
  const { setSite } = useSession();
  const page = useDayPage(id, useDb(() => db.today));
  const missing = today && today.marker === 'work' ? today.missing : [];
  const team = (today?.team ?? []).filter((m) => m.phone);
  return (
    <Card style={{ gap: spacing.md }}>
      <Pressable onPress={() => router.push({ pathname: '/site', params: { id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconBadge name="office-building" size={42} />
        <View style={{ flex: 1 }}>
          <T.h2>{name}</T.h2>
          {today ? <T.small>{t('attendance.workers', { count: today.labour.workers })}{today.labour.costPaise ? ` · ${rupees(today.labour.costPaise)}` : ''}</T.small> : null}
        </View>
        <Icon name="chevron-right" size={26} color={colors.faint} />
      </Pressable>
      {today?.alerts.map((a) => noticeText(lang, a)).map((a) => <Banner key={a} text={a} />)}
      {page.length ? <DiaryLines lines={page} max={4} /> : <T.body muted>{t('owner.notWritten')}</T.body>}
      {page.length > 4 ? <T.small>+{page.length - 4}</T.small> : null}
      {missing.length ? (
        <View style={{ gap: spacing.sm, backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md }}>
          <T.body color={colors.danger}>{t('report.missing')}: {missing.map((m) => t(`missing.${m}` as 'missing.attendance')).join(', ')}</T.body>
          {team.length ? (
            <Row style={{ flexWrap: 'wrap' }}>
              {team.map((m) => (
                <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={t('owner.callHint', { name: m.name })} onPress={() => openTel(m.phone)} style={s.callBtn}>
                  <Icon name="phone" size={18} color={colors.primaryText} />
                  <Text style={s.callText}>{m.name.split(' ')[0]}</Text>
                </Pressable>
              ))}
            </Row>
          ) : null}
        </View>
      ) : null}
      <Row>
        <Button style={{ flex: 1 }} small kind="secondary" icon="chart-box-outline" label={t('owner.seeDay')} onPress={() => router.push({ pathname: '/site', params: { id } })} />
        {can('attendance', 'C') ? <Button style={{ flex: 1 }} small kind="secondary" icon="pencil-outline" label={t('owner.makeEntry')} onPress={() => { setSite(id); router.push('/entries'); }} /> : null}
      </Row>
    </Card>
  );
}
