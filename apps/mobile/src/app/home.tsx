import { noticeText, type Notice } from '@site-diary/i18n';
import { addDays, formatNumber, formatPaise, isLowStock, shortDate, wageWeek, type StockRow } from '@site-diary/shared';
import { colors, spacing } from '@site-diary/ui-tokens';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, Share, Text, View } from 'react-native';
import { SyncBadge } from '../components/SyncBadge';
import { Banner, Button, Card, Chip, Row, s, Screen, T, Tile } from '../components/ui';
import { get, isDemo } from '../lib/api';
import { db, useDb, type Row as DbRow } from '../lib/db';
import { notice, useCan, useOnline, useSite } from '../lib/hooks';
import { useDayName, useName, useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { shareDailyReport } from '../lib/share';
import { daysSince, useDayPage, useDiary, type DiaryKind } from '../lib/diary';
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

function Bell() {
  const t = useT();
  const { data } = useOnline<{ unread: number }>('/notifications');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('notifications.title')} onPress={() => router.push('/notifications')} hitSlop={10} style={{ padding: 4 }}>
      <Text style={{ fontSize: 22 }}>🔔{data?.unread ? <Text style={{ fontSize: 13, color: colors.danger, fontWeight: '800' }}> {data.unread}</Text> : null}</Text>
    </Pressable>
  );
}

// M3 (field) / M12 (owner): one home that shows each role only its own jobs.
export default function Home() {
  const { me } = useSession();
  const role = me?.user.role;
  if (role === 'owner' || role === 'accountant') return <OfficeHome />;
  return <FieldHome />;
}

const ICON: Record<DiaryKind, string> = { day: '🌧', attendance: '👷', grn: '🚚', used: '🧱', progress: '🏗', advance: '₹', indent: '📝', issue: '⚠' };

function DiaryLines({ lines, max = Infinity }: { lines: { kind: DiaryKind; text: string }[]; max?: number }) {
  return lines.slice(0, max).map((l, i) => (
    <Row key={i} style={{ alignItems: 'flex-start' }}>
      <Text style={{ width: 24, fontSize: 16 }}>{ICON[l.kind]}</Text>
      <View style={{ flex: 1 }}><T.body>{l.text}</T.body></View>
    </Row>
  ));
}

/** The day as a message, the way supervisors already send it on WhatsApp. */
async function shareText(text: string) {
  if (Platform.OS === 'web') {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    return;
  }
  await Share.share({ message: text });
}

function FieldHome() {
  const t = useT();
  const dayName = useDayName();
  const diary = useDiary();
  const can = useCan();
  const { me } = useSession();
  const { siteId, site } = useSite();
  const [sending, setSending] = useState(false);
  const approvals = useOnline<{ count: number }>(can('attendance', 'A') || can('indent', 'A') ? '/approvals/count' : null);
  const today = useDb(() => db.today);
  // The diary can be turned back a page: what was written on an earlier day.
  const [day, setDay] = useState(today);
  const page = useDayPage(siteId, day);
  const awaited = useDb(() => (can('store', 'C') ? awaitedMaterial(siteId) : []));
  const stats = useDb(() => {
    const mine = (rows: DbRow[]) => rows.filter((r) => r.projectId === siteId);
    const att = mine(db.rows('attendanceEntry')).filter((r) => r.date === today);
    const settings = mine(db.rows('siteMaterialSetting'));
    const low = settings.filter((s) => isLowStock(db.stock.find((x: StockRow) => x.projectId === siteId && x.materialId === s.materialId)?.qty ?? 0, Number(s.minStock))).length;
    return {
      workers: att.reduce((sum, r) => sum + Number(r.count) + Number(r.halfDayCount), 0),
      attendance: att.length,
      grns: mine(db.rows('grn')).filter((r) => r.date === today).length,
      issues: mine(db.rows('materialIssue')).filter((r) => r.date === today).length,
      progress: mine(db.rows('dailyProgress')).filter((r) => r.date === today).length,
      openIssues: mine(db.rows('issue')).filter((r) => r.status === 'open').length,
      low,
      incoming: db.rows('stockTransfer').filter((r) => r.toProjectId === siteId && r.status === 'sent').length,
      marker: mine(db.rows('siteDay')).find((r) => r.date === today)?.marker as string | undefined,
      firstSync: db.rev === '0',
    };
  });
  if (!siteId) {
    router.replace('/sites');
    return null;
  }
  const isToday = day === today;
  const working = !stats.marker || stats.marker === 'work';
  const pending = [
    ...(working && can('attendance', 'C') && !stats.attendance ? [{ label: t('home.attendance'), go: '/attendance' as const }] : []),
    ...(working && can('progress', 'C') && !stats.progress ? [{ label: t('home.progress'), go: '/progress' as const }] : []),
  ];
  // "All done" only for people whose day has entries they must make.
  const hasDuties = can('attendance', 'C') || can('progress', 'C');
  const message = [`${site?.name ?? ''} — ${dayName(day)}`, ...page.map((l) => `${ICON[l.kind]} ${l.text}`)].join('\n');
  return (
    <Screen
      back={false}
      title={site?.name ?? ''}
      right={<Row><SyncBadge /><Bell /></Row>}
      footer={
        <Row>
          <Button style={{ flex: 2 }} label={t('home.whatsapp')} disabled={!page.length} onPress={() => void shareText(message)} />
          {can('reports', 'V') || can('attendance', 'C') ? (
            <Button
              style={{ flex: 1 }}
              kind="secondary"
              label={t('home.pdf')}
              busy={sending}
              onPress={() => {
                setSending(true);
                shareDailyReport(siteId, t('home.reportShareTitle'), day)
                  .catch((e: unknown) => notice(t('home.reportFailed'), e instanceof Error ? e.message : String(e)))
                  .finally(() => setSending(false));
              }}
            />
          ) : null}
        </Row>
      }
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <T.body muted>{t('home.hello', { name: me?.user.name.split(' ')[0] ?? '' })}</T.body>
        {(me?.projects.length ?? 0) > 1 ? <Pressable onPress={() => router.push('/sites')} hitSlop={8}><Text style={{ color: colors.primary, fontWeight: '700' }}>{t('home.changeSite')}</Text></Pressable> : null}
      </Row>
      {isDemo() ? <Banner tone="info" text={t('demo.banner')} onPress={() => router.push('/profile')} /> : null}
      {stats.firstSync ? <Banner tone="info" text={t('home.firstSync')} /> : null}

      {/* The day's page of the diary: what has been written, and what is still to do today. */}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.prevDay')} onPress={() => setDay(addDays(day, -1))} hitSlop={8} style={s.dayBtn}><Text style={s.stepSign}>‹</Text></Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <T.h2>{isToday ? t('home.diaryTitle') : t('home.pastDay', { day: dayName(day) })}</T.h2>
            {isToday ? <T.small>{dayName(today)}</T.small> : <Pressable onPress={() => setDay(today)} hitSlop={8}><Text style={{ color: colors.primary, fontWeight: '700' }}>{t('home.backToday')}</Text></Pressable>}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.nextDay')} disabled={isToday} onPress={() => setDay(addDays(day, 1))} hitSlop={8} style={[s.dayBtn, isToday && { opacity: 0.3 }]}><Text style={s.stepSign}>›</Text></Pressable>
        </Row>
        {page.length ? <DiaryLines lines={page} /> : <T.body muted>{isToday ? t('home.diaryEmpty') : t('home.dayEmpty')}</T.body>}
        {!isToday ? null : pending.length ? (
          <Row style={{ flexWrap: 'wrap' }}>
            <T.body bold color={colors.warning}>{t('home.pending')}</T.body>
            {pending.map((p) => <Chip key={p.go} label={p.label} tone="warn" onPress={() => router.push(p.go)} />)}
          </Row>
        ) : hasDuties && page.length ? <T.small color={colors.success}>✓ {t('home.allDone')}</T.small> : null}
      </Card>

      {awaited.length ? (
        <Card>
          <T.h2>🚚 {t('store.awaited')}</T.h2>
          {awaited.slice(0, 6).map((a) => (
            <Pressable key={`${a.indentId}:${a.materialId}`} accessibilityRole="button" onPress={() => router.push({ pathname: '/grn', params: { material: a.materialId, qty: String(a.qty) } })} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={{ flex: 1 }}><T.body>{t('store.awaitedLine', { item: diary.material(a.materialId, a.qty), date: shortDate(a.neededBy) })}</T.body></View>
              {a.late ? <T.small color={colors.danger}>{t('store.late')}</T.small> : a.ordered ? <T.small color={colors.success}>{t('store.ordered')}</T.small> : null}
              <T.body color={colors.primary}>›</T.body>
            </Pressable>
          ))}
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {can('attendance', 'C') && (
          <Tile label={t('home.attendance')} hint={stats.attendance ? t('attendance.workers', { count: stats.workers }) : t('home.notEntered')} tone={stats.attendance ? 'ok' : 'warn'} onPress={() => router.push('/attendance')} />
        )}
        {can('store', 'C') && <Tile label={t('home.materialIn')} hint={stats.grns ? t('home.entries', { count: stats.grns }) : t('home.none')} onPress={() => router.push('/grn')} />}
        {can('store', 'C') && <Tile label={t('home.materialUsed')} hint={stats.issues ? t('home.entries', { count: stats.issues }) : t('home.none')} onPress={() => router.push('/used')} />}
        {can('progress', 'C') && <Tile label={t('home.progress')} hint={stats.progress ? t('home.entries', { count: stats.progress }) : t('home.notEntered')} tone={stats.progress ? 'ok' : undefined} onPress={() => router.push('/progress')} />}
      </View>
      <T.small>{t('home.more')}</T.small>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {can('wages', 'C') && <Tile compact label={t('home.advance')} onPress={() => router.push('/advance')} />}
        {can('indent', 'C') && <Tile compact label={t('home.indent')} onPress={() => router.push('/indent')} />}
        {can('progress', 'C') && <Tile compact label={t('home.issues')} badge={stats.openIssues} onPress={() => router.push('/issues')} />}
        <Tile compact label={t('home.stock')} badge={stats.low || undefined} tone={stats.low ? 'warn' : undefined} onPress={() => router.push('/stock')} />
        {can('store', 'C') && <Tile compact label={t('home.transfers')} badge={stats.incoming} onPress={() => router.push('/transfer')} />}
        {approvals.data ? <Tile compact label={t('home.approvals')} badge={approvals.data.count} onPress={() => router.push('/approvals')} /> : null}
        {can('wages', 'V') && <Tile compact label={t('home.hisab')} onPress={() => router.push('/hisab')} />}
        {can('reports', 'V') && <Tile compact label={t('home.siteToday')} onPress={() => router.push({ pathname: '/site', params: { id: siteId } })} />}
        {can('reports', 'V') && <Tile compact label={t('home.reports')} onPress={() => router.push('/reports')} />}
        <Tile compact label={t('home.profile')} onPress={() => router.push('/profile')} />
      </View>
    </Screen>
  );
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

function OfficeHome() {
  const t = useT();
  const can = useCan();
  const dayName = useDayName();
  const name = useName();
  const diary = useDiary();
  const { me, lang } = useSession();
  const { data, error, reload } = useOnline<Dashboard>('/dashboard');
  const sites = me?.projects ?? [];
  const wages = useWageDay(sites.map((p) => p.id), can('wages', 'V'));
  // Back on the home (after an approval, a settlement): fresh numbers. The first focus is the first load.
  const seen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (seen.current) void Promise.all([reload(), wages.reload()]);
    seen.current = true;
  }, [reload, wages.reload]));

  // Things only the owner can sort out, from the sites' own entries (works offline).
  const attention = useDb(() => sites.flatMap((p) => [
    ...db.rows('issue').filter((i) => i.projectId === p.id && i.status === 'open' && daysSince(i.createdAt) >= 3)
      .map((i) => ({ key: i.id, site: p.id, text: t('owner.oldIssue', { site: p.name, days: daysSince(i.createdAt), title: String(i.title) }) })),
    ...siteStock(p.id).filter((r) => r.soon || r.low).map((r) => ({
      key: `${p.id}:${r.materialId}`, site: p.id,
      text: r.left?.days ? t('owner.stockSoon', { site: p.name, material: name(r.material), days: r.left.days }) : t('owner.stockLow', { site: p.name, material: name(r.material), qty: formatNumber(r.qty), unit: String(r.material?.unit ?? '') }),
    })),
    ...awaitedMaterial(p.id).filter((a) => a.late)
      .map((a) => ({ key: `${a.indentId}:${a.materialId}`, site: p.id, text: t('owner.materialLate', { site: p.name, item: diary.material(a.materialId, a.qty), date: shortDate(a.neededBy) }) })),
  ]));

  return (
    <Screen back={false} title={me?.company.name ?? ''} right={<Row><SyncBadge /><Bell /></Row>}>
      {isDemo() ? <Banner tone="info" text={t('demo.banner')} onPress={() => router.push('/profile')} /> : null}
      {error && !data ? <Banner tone="error" text={error === 'offline' ? t('common.offlineOnline') : error} onPress={() => void reload()} /> : null}
      <T.body muted>{t('common.today')} · {dayName(useDb(() => db.today))}</T.body>
      {data ? (
        <Row style={{ gap: spacing.sm }}>
          <Card style={{ flex: 1 }}><T.big>{data.totals.workers}</T.big><T.small>{t('owner.workersToday', { yesterday: data.totals.yesterday })}</T.small></Card>
          {can('wages', 'V') ? <Card style={{ flex: 1 }} onPress={() => router.push('/hisab')}><T.big>{formatPaise(data.totals.labourCostPaise)}</T.big><T.small>{t('owner.labourCost')}</T.small></Card> : null}
          <Card style={{ flex: 1 }} onPress={() => router.push('/approvals')}><T.big color={data.totals.pendingApprovals ? colors.primary : undefined}>{data.totals.pendingApprovals}</T.big><T.small>{t('home.approvals')}</T.small></Card>
        </Row>
      ) : null}

      {data?.totals.pendingApprovals || attention.length ? (
        <Card style={{ borderColor: colors.warning, borderWidth: 2 }}>
          <T.h2>{t('owner.needsYou')}</T.h2>
          {data?.totals.pendingApprovals ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/approvals')} style={{ minHeight: 40, justifyContent: 'center' }}>
              <T.body bold color={colors.primary}>✋ {t('owner.approvalsWaiting', { count: data.totals.pendingApprovals })} ›</T.body>
            </Pressable>
          ) : null}
          {attention.slice(0, 8).map((a) => (
            <Pressable key={a.key} accessibilityRole="button" onPress={() => router.push({ pathname: '/site', params: { id: a.site } })} style={{ minHeight: 40, justifyContent: 'center' }}>
              <T.body>⚠ {a.text}</T.body>
            </Pressable>
          ))}
        </Card>
      ) : null}

      {can('wages', 'V') && wages.data && (wages.data.gross || wages.data.advances) ? (
        <Card onPress={() => router.push('/hisab')}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T.small>{t('owner.toPay', { day: dayName(wages.week.to) })}</T.small>
              <T.big>{rupees(wages.data.net)}</T.big>
              <T.small>{t('owner.toPayLine', { gross: rupees(wages.data.gross), advances: rupees(wages.data.advances) })}</T.small>
            </View>
            <T.body color={colors.primary} bold>{t('home.hisab')} ›</T.body>
          </Row>
        </Card>
      ) : null}

      {sites.map((p) => <SiteCard key={p.id} id={p.id} name={p.name} today={data?.sites.find((x) => x.project.id === p.id)} lang={lang} />)}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {can('wages', 'V') && <Tile compact label={t('home.hisab')} onPress={() => router.push('/hisab')} />}
        <Tile compact label={t('home.reports')} onPress={() => router.push('/reports')} />
        <Tile compact label={t('home.profile')} onPress={() => router.push('/profile')} />
      </View>
    </Screen>
  );
}

/** One site on the owner's home: its diary page for today, as the supervisor wrote it. */
function SiteCard({ id, name, today, lang }: { id: string; name: string; today?: SiteToday; lang: Parameters<typeof noticeText>[0] }) {
  const t = useT();
  const page = useDayPage(id, useDb(() => db.today));
  const missing = today && today.marker === 'work' ? today.missing : [];
  const team = (today?.team ?? []).filter((m) => m.phone);
  return (
    <Card onPress={() => router.push({ pathname: '/site', params: { id } })}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}><T.h2>{name}</T.h2></View>
        {today ? <T.body bold>{t('attendance.workers', { count: today.labour.workers })}{today.labour.costPaise ? ` · ${formatPaise(today.labour.costPaise)}` : ''}</T.body> : null}
      </Row>
      {today?.alerts.map((a) => noticeText(lang, a)).map((a) => <T.small key={a} color={colors.warning}>⚠ {a}</T.small>)}
      {page.length ? <DiaryLines lines={page} max={5} /> : <T.body muted>{t('owner.notWritten')}</T.body>}
      {missing.length ? <T.small color={colors.danger}>{t('report.missing')}: {missing.map((m) => t(`missing.${m}` as 'missing.attendance')).join(', ')}</T.small> : null}
      {missing.length && team.length ? (
        <Row style={{ flexWrap: 'wrap' }}>
          {team.map((m) => (
            <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={t('owner.callHint', { name: m.name })} onPress={() => void Linking.openURL(`tel:${m.phone}`)} style={s.callBtn}>
              <Text style={s.callText}>{t('owner.call', { name: m.name.split(' ')[0] ?? m.name })}</Text>
            </Pressable>
          ))}
        </Row>
      ) : null}
      <T.small color={colors.primary}>{page.length > 5 ? `+${page.length - 5} · ` : ''}{t('owner.seeDay')}</T.small>
    </Card>
  );
}
