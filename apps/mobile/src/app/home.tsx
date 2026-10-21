import { noticeText, type Notice } from '@site-diary/i18n';
import { formatPaise, isLowStock, type StockRow } from '@site-diary/shared';
import { colors, spacing } from '@site-diary/ui-tokens';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SyncBadge } from '../components/SyncBadge';
import { Banner, Button, Card, Row, Screen, T, Tile } from '../components/ui';
import { isDemo } from '../lib/api';
import { db, useDb, type Row as DbRow } from '../lib/db';
import { notice, useCan, useOnline, useSite } from '../lib/hooks';
import { useDayName, useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { shareDailyReport } from '../lib/share';

interface Dashboard {
  date: string;
  totals: { workers: number; yesterday: number; labourCostPaise: number; grnLines: number; photos: number; sitesMissingEntry: number; pendingApprovals: number };
  sites: { project: { id: string; name: string }; labour: { workers: number; yesterday: number; changePct: number | null; costPaise: number; costMissingRates: boolean }; materialIn: unknown[]; materialUsed: unknown[]; progress: unknown[]; photos: unknown[]; missing: string[]; alerts: Notice[]; marker: string }[];
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

function FieldHome() {
  const t = useT();
  const dayName = useDayName();
  const can = useCan();
  const { me } = useSession();
  const { siteId, site } = useSite();
  const [sending, setSending] = useState(false);
  const approvals = useOnline<{ count: number }>(can('attendance', 'A') || can('indent', 'A') ? '/approvals/count' : null);
  const today = useDb(() => db.today);
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
  return (
    <Screen
      back={false}
      title={site?.name ?? ''}
      right={<Row><SyncBadge /><Bell /></Row>}
      footer={
        <Button
          label={t('home.sendReport')}
          busy={sending}
          onPress={() => {
            setSending(true);
            shareDailyReport(siteId, t('home.reportShareTitle'))
              .catch((e: unknown) => notice(t('home.reportFailed'), e instanceof Error ? e.message : String(e)))
              .finally(() => setSending(false));
          }}
        />
      }
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <T.body muted>{t('home.hello', { name: me?.user.name.split(' ')[0] ?? '' })} · {dayName(today)}</T.body>
        <Pressable onPress={() => router.push('/sites')} hitSlop={8}><Text style={{ color: colors.primary, fontWeight: '700' }}>{t('home.changeSite')}</Text></Pressable>
      </Row>
      {isDemo() ? <Banner tone="info" text={t('demo.banner')} onPress={() => router.push('/profile')} /> : null}
      {stats.firstSync ? <Banner tone="info" text={t('home.firstSync')} /> : null}
      {stats.marker && stats.marker !== 'work' ? <Banner tone="info" text={t(`marker.${stats.marker}` as 'marker.work')} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {can('attendance', 'C') && (
          <Tile label={t('home.attendance')} hint={stats.attendance ? t('attendance.workers', { count: stats.workers }) : t('home.notEntered')} tone={stats.attendance ? 'ok' : 'warn'} onPress={() => router.push('/attendance')} />
        )}
        {can('store', 'C') && <Tile label={t('home.materialIn')} hint={stats.grns ? t('home.entries', { count: stats.grns }) : t('home.none')} onPress={() => router.push('/grn')} />}
        {can('store', 'C') && <Tile label={t('home.materialUsed')} hint={stats.issues ? t('home.entries', { count: stats.issues }) : t('home.none')} onPress={() => router.push('/used')} />}
        {can('progress', 'C') && <Tile label={t('home.progress')} hint={stats.progress ? t('home.entries', { count: stats.progress }) : t('home.notEntered')} tone={stats.progress ? 'ok' : undefined} onPress={() => router.push('/progress')} />}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {can('wages', 'C') && <Tile label={t('home.advance')} onPress={() => router.push('/advance')} />}
        {can('indent', 'C') && <Tile label={t('home.indent')} onPress={() => router.push('/indent')} />}
        {can('progress', 'C') && <Tile label={t('home.issues')} badge={stats.openIssues} onPress={() => router.push('/issues')} />}
        <Tile label={t('home.stock')} badge={stats.low || undefined} tone={stats.low ? 'warn' : undefined} hint={stats.low ? t('home.lowCount', { count: stats.low }) : undefined} onPress={() => router.push('/stock')} />
        {can('store', 'C') && <Tile label={t('home.transfers')} badge={stats.incoming} onPress={() => router.push('/transfer')} />}
        {approvals.data ? <Tile label={t('home.approvals')} badge={approvals.data.count} onPress={() => router.push('/approvals')} /> : null}
        {can('wages', 'V') && <Tile label={t('home.hisab')} onPress={() => router.push('/hisab')} />}
        {can('reports', 'V') && <Tile label={t('home.siteToday')} onPress={() => router.push({ pathname: '/site', params: { id: siteId } })} />}
        {can('reports', 'V') && <Tile label={t('home.reports')} onPress={() => router.push('/reports')} />}
        <Tile label={t('home.profile')} onPress={() => router.push('/profile')} />
      </View>
    </Screen>
  );
}

function OfficeHome() {
  const t = useT();
  const can = useCan();
  const { me, lang } = useSession();
  const { data, error, loading, reload } = useOnline<Dashboard>('/dashboard');
  return (
    <Screen back={false} title={me?.company.name ?? ''} right={<Bell />}>
      {isDemo() ? <Banner tone="info" text={t('demo.banner')} onPress={() => router.push('/profile')} /> : null}
      {error ? <Banner tone="error" text={error === 'offline' ? t('common.offlineOnline') : error} onPress={reload} /> : null}
      {data ? (
        <>
          <Row style={{ gap: spacing.md }}>
            <Card style={{ flex: 1 }}><T.big>{data.totals.workers}</T.big><T.small>{t('owner.workersToday', { yesterday: data.totals.yesterday })}</T.small></Card>
            <Card style={{ flex: 1 }} onPress={() => router.push('/approvals')}><T.big color={data.totals.pendingApprovals ? colors.primary : undefined}>{data.totals.pendingApprovals}</T.big><T.small>{t('home.approvals')}</T.small></Card>
          </Row>
          {data.totals.labourCostPaise ? (
            <Card onPress={() => router.push('/hisab')}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View>
                  <T.small>{t('owner.labourCost')}{data.sites.some((x) => x.labour.costMissingRates) ? ` · ${t('owner.costMissing')}` : ''}</T.small>
                  <T.big>{formatPaise(data.totals.labourCostPaise)}</T.big>
                </View>
                <T.body color={colors.primary} bold>{t('home.hisab')} ›</T.body>
              </Row>
            </Card>
          ) : null}
          {data.sites.map((s) => (
            <Card key={s.project.id} onPress={() => router.push({ pathname: '/site', params: { id: s.project.id } })}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T.h2>{s.project.name}</T.h2>
                <T.body bold>{t('attendance.workers', { count: s.labour.workers })}{s.labour.costPaise ? ` · ${formatPaise(s.labour.costPaise)}` : ''}</T.body>
              </Row>
              <T.small>
                {t('owner.siteLine', { grn: s.materialIn.length, used: s.materialUsed.length, progress: s.progress.length, photos: s.photos.length })}
                {s.labour.changePct !== null ? ` · ${s.labour.changePct > 0 ? '+' : ''}${s.labour.changePct}%` : ''}
              </T.small>
              {s.alerts.map((a) => noticeText(lang, a)).map((a) => <T.small key={a} color={colors.warning}>⚠ {a}</T.small>)}
              {s.missing.length && s.marker === 'work' ? <T.small color={colors.danger}>{t('report.missing')}: {s.missing.map((m) => t(`missing.${m}` as 'missing.attendance')).join(', ')}</T.small> : null}
            </Card>
          ))}
        </>
      ) : null}
      <Button kind="secondary" label={loading ? t('common.loading') : t('common.refresh')} onPress={reload} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <Tile label={t('home.approvals')} onPress={() => router.push('/approvals')} />
        {can('wages', 'V') && <Tile label={t('home.hisab')} onPress={() => router.push('/hisab')} />}
        <Tile label={t('home.reports')} onPress={() => router.push('/reports')} />
        <Tile label={t('home.profile')} onPress={() => router.push('/profile')} />
      </View>
    </Screen>
  );
}
