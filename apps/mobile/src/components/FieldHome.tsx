import { addDays, isLowStock, shortDate, type StockRow } from '@site-diary/shared';
import { colors, radius, spacing } from '@site-diary/ui-tokens';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { isDemo } from '../lib/api';
import { db, useDb, type Row as DbRow } from '../lib/db';
import { useDayPage, useDiary, type DiaryKind } from '../lib/diary';
import { notice, useCan, useOnline, useSite } from '../lib/hooks';
import { useDayName, useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { shareDailyReport, shareMessage } from '../lib/share';
import { awaitedMaterial } from '../lib/stock';
import { SyncBadge } from './SyncBadge';
import { Banner, Button, Card, Chip, Icon, IconBadge, Row, s, Screen, Section, T, Tile, type IconName, type Tone } from './ui';

export const KIND: Record<DiaryKind, { icon: IconName; tone: Tone }> = {
  day: { icon: 'weather-pouring', tone: 'info' },
  attendance: { icon: 'account-group', tone: 'primary' },
  grn: { icon: 'truck-delivery', tone: 'ok' },
  used: { icon: 'wall', tone: 'warn' },
  progress: { icon: 'crane', tone: 'info' },
  advance: { icon: 'cash', tone: 'ok' },
  indent: { icon: 'clipboard-text-outline', tone: 'primary' },
  issue: { icon: 'alert-circle-outline', tone: 'danger' },
};

/** A day's diary lines, each with the mark of what it is. */
export function DiaryLines({ lines, max = Infinity }: { lines: { kind: DiaryKind; text: string }[]; max?: number }) {
  return lines.slice(0, max).map((l, i) => (
    <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
      <IconBadge name={KIND[l.kind].icon} tone={KIND[l.kind].tone} size={30} />
      <View style={{ flex: 1, paddingTop: 3 }}><T.body>{l.text}</T.body></View>
    </View>
  ));
}

export function Bell() {
  const t = useT();
  const { data } = useOnline<{ unread: number }>('/notifications');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('notifications.title')} onPress={() => router.push('/notifications')} hitSlop={10} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={data?.unread ? 'bell-ring-outline' : 'bell-outline'} size={26} />
      {data?.unread ? (
        <View style={{ position: 'absolute', top: 4, right: 2, minWidth: 18, height: 18, borderRadius: radius.pill, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Text style={{ color: colors.primaryText, fontSize: 11, fontWeight: '800' }}>{data.unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// M3: the site's diary for the day, what is still to do, and the entry screens. Home for supervisors,
// store keepers and engineers; the owner opens it for a site from his home to make entries himself.
export function FieldHome({ back = false }: { back?: boolean }) {
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
    const low = settings.filter((x) => isLowStock(db.stock.find((y: StockRow) => y.projectId === siteId && y.materialId === x.materialId)?.qty ?? 0, Number(x.minStock))).length;
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
  // No site chosen (or the person was just switched): pick one — after drawing, never during it.
  useEffect(() => {
    if (!siteId) router.replace('/sites');
  }, [siteId]);
  if (!siteId) return null;
  const isToday = day === today;
  const working = !stats.marker || stats.marker === 'work';
  const pending = [
    ...(working && can('attendance', 'C') && !stats.attendance ? [{ label: t('home.attendance'), go: '/attendance' as const }] : []),
    ...(working && can('progress', 'C') && !stats.progress ? [{ label: t('home.progress'), go: '/progress' as const }] : []),
  ];
  // "All done" only for people whose day has entries they must make.
  const hasDuties = me?.user.role === 'supervisor' || me?.user.role === 'engineer';
  const message = [`*${site?.name ?? ''}* — ${dayName(day)}`, ...page.map((l) => `• ${l.text}`)].join('\n');
  const setupRights = me?.user.role === 'owner' || can('attendance', 'A') || me?.user.role === 'store';

  return (
    <Screen
      back={back}
      title={site?.name ?? ''}
      subtitle={`${t('home.hello', { name: me?.user.name.split(' ')[0] ?? '' })} · ${dayName(today)}`}
      right={
        <Row style={{ gap: 2 }}>
          <SyncBadge />
          {(me?.projects.length ?? 0) > 1 && !back ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('home.changeSite')} onPress={() => router.push('/sites')} hitSlop={8} style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="swap-horizontal" size={24} />
            </Pressable>
          ) : null}
          {back ? null : <Bell />}
        </Row>
      }
      footer={
        <Row>
          <Button style={{ flex: 2 }} kind="success" icon="whatsapp" label={t('home.whatsapp')} disabled={!page.length} onPress={() => void shareMessage(message)} />
          <Button
            style={{ flex: 1 }}
            kind="secondary"
            icon="file-pdf-box"
            label="PDF"
            busy={sending}
            onPress={() => {
              setSending(true);
              shareDailyReport(siteId, t('home.reportShareTitle'), day)
                .catch((e: unknown) => notice(t('home.reportFailed'), e instanceof Error ? e.message : String(e)))
                .finally(() => setSending(false));
            }}
          />
        </Row>
      }
    >
      {isDemo() ? <Banner tone="info" text={t('demo.banner')} onPress={() => router.push('/profile')} /> : null}
      {stats.firstSync ? <Banner tone="info" text={t('home.firstSync')} /> : null}

      {/* The day's page of the diary: what has been written, and what is still to do today. */}
      <Card style={{ gap: spacing.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.prevDay')} onPress={() => setDay(addDays(day, -1))} hitSlop={8} style={s.dayBtn}><Icon name="chevron-left" size={28} /></Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <T.h2>{isToday ? t('home.diaryTitle') : t('home.pastDay', { day: dayName(day) })}</T.h2>
            {isToday ? <T.small>{dayName(today)}</T.small> : <Pressable onPress={() => setDay(today)} hitSlop={8}><Text style={{ color: colors.primary, fontWeight: '700' }}>{t('home.backToday')}</Text></Pressable>}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.nextDay')} disabled={isToday} onPress={() => setDay(addDays(day, 1))} hitSlop={8} style={[s.dayBtn, isToday && { opacity: 0.3 }]}><Icon name="chevron-right" size={28} /></Pressable>
        </Row>
        {page.length ? <DiaryLines lines={page} /> : (
          <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md }}>
            <Icon name="notebook-outline" size={36} color={colors.faint} />
            <T.body muted>{isToday ? t('home.diaryEmpty') : t('home.dayEmpty')}</T.body>
          </View>
        )}
        {!isToday ? null : pending.length ? (
          <View style={{ gap: spacing.sm, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md }}>
            <T.body bold color={colors.warning}>{t('home.pending')}</T.body>
            <Row style={{ flexWrap: 'wrap' }}>
              {pending.map((p) => <Chip key={p.go} icon="clock-outline" label={p.label} tone="warn" onPress={() => router.push(p.go)} />)}
            </Row>
          </View>
        ) : hasDuties && page.length ? (
          <Row style={{ backgroundColor: colors.successSoft, borderRadius: radius.md, padding: spacing.md }}>
            <Icon name="check-circle" size={22} color={colors.success} />
            <View style={{ flex: 1 }}><T.body color={colors.success}>{t('home.allDone')}</T.body></View>
          </Row>
        ) : null}
      </Card>

      {awaited.length ? (
        <Card>
          <Row><IconBadge name="truck-delivery-outline" tone="ok" size={34} /><T.h2>{t('store.awaited')}</T.h2></Row>
          {awaited.slice(0, 6).map((a) => (
            <View key={`${a.indentId}:${a.materialId}`} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              {/* Two separate buttons side by side (a button inside a button is not allowed). */}
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/grn', params: { material: a.materialId, qty: String(a.qty) } })} style={{ flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ flex: 1 }}><T.body>{t('store.awaitedLine', { item: diary.material(a.materialId, a.qty), date: shortDate(a.neededBy) })}</T.body></View>
                {a.ordered ? <T.small color={a.late ? colors.danger : colors.success}>{a.late ? t('store.late') : t('store.ordered')}</T.small> : null}
                <Icon name="chevron-right" size={22} color={colors.faint} />
              </Pressable>
              {!a.ordered && can('po', 'C') ? <Chip icon="cart-arrow-right" label={t('order.orderIt')} onPress={() => router.push({ pathname: '/order', params: { indent: a.indentId } })} /> : null}
            </View>
          ))}
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {can('attendance', 'C') && (
          <Tile icon="account-group" label={t('home.attendance')} hint={stats.attendance ? t('attendance.workers', { count: stats.workers }) : t('home.notEntered')} tone={stats.attendance ? 'ok' : working ? 'warn' : undefined} onPress={() => router.push('/attendance')} />
        )}
        {can('progress', 'C') && <Tile icon="crane" label={t('home.progress')} hint={stats.progress ? t('home.entries', { count: stats.progress }) : t('home.notEntered')} tone={stats.progress ? 'ok' : undefined} onPress={() => router.push('/progress')} />}
        {can('store', 'C') && <Tile icon="truck-delivery" label={t('home.materialIn')} hint={stats.grns ? t('home.entries', { count: stats.grns }) : t('home.none')} tone={stats.grns ? 'ok' : undefined} onPress={() => router.push('/grn')} />}
        {can('store', 'C') && <Tile icon="wall" label={t('home.materialUsed')} hint={stats.issues ? t('home.entries', { count: stats.issues }) : t('home.none')} tone={stats.issues ? 'ok' : undefined} onPress={() => router.push('/used')} />}
      </View>

      <Section title={t('home.more')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {can('wages', 'C') && <Tile compact icon="cash" label={t('home.advance')} onPress={() => router.push('/advance')} />}
        {can('indent', 'C') && <Tile compact icon="clipboard-text-outline" label={t('home.indent')} onPress={() => router.push('/indent')} />}
        {can('progress', 'C') && <Tile compact icon="alert-circle-outline" label={t('home.issues')} badge={stats.openIssues} onPress={() => router.push('/issues')} />}
        <Tile compact icon="warehouse" label={t('home.stock')} badge={stats.low || undefined} tone={stats.low ? 'warn' : undefined} onPress={() => router.push('/stock')} />
        {can('store', 'C') && <Tile compact icon="swap-horizontal" label={t('home.transfers')} badge={stats.incoming} onPress={() => router.push('/transfer')} />}
        {approvals.data && !back ? <Tile compact icon="check-decagram-outline" label={t('home.approvals')} badge={approvals.data.count} onPress={() => router.push('/approvals')} /> : null}
        {can('wages', 'V') && !back && <Tile compact icon="calculator-variant-outline" label={t('home.hisab')} onPress={() => router.push('/hisab')} />}
        {can('reports', 'V') && <Tile compact icon="chart-box-outline" label={t('home.siteToday')} onPress={() => router.push({ pathname: '/site', params: { id: siteId } })} />}
        {can('reports', 'V') && !back && <Tile compact icon="file-chart-outline" label={t('home.reports')} onPress={() => router.push('/reports')} />}
        {can('po', 'V') && !back ? <Tile compact icon="truck-outline" label={t('supplier.title')} onPress={() => router.push('/suppliers')} /> : null}
        {setupRights && !back ? <Tile compact icon="cog-outline" label={t('setup.title')} onPress={() => router.push('/setup')} /> : null}
        {back ? null : <Tile compact icon="account-circle-outline" label={t('home.profile')} onPress={() => router.push('/profile')} />}
      </View>
    </Screen>
  );
}

export const openTel = (phone: string) => void Linking.openURL(`tel:${phone}`);
