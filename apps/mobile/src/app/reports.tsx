import { formatPaise } from '@site-diary/shared';
import { colors, spacing } from '@site-diary/ui-tokens';
import { useState } from 'react';
import { View } from 'react-native';
import { Banner, Button, Card, Chips, Empty, flush, ListRow, Row, Screen, Section, T } from '../components/ui';
import { isDemo, post } from '../lib/api';
import { db, useDb } from '../lib/db';
import { notice, useCan, useOnline } from '../lib/hooks';
import { useDayName, useT } from '../lib/i18n';
import { monthRange, useMonth, type MonthRow } from '../lib/month';
import { useSession } from '../lib/session';
import { shareLink, shareReportFile } from '../lib/share';

/** One site's (or the total's) month: what it cost and what was paid. */
function MonthLines({ r }: { r: MonthRow }) {
  const t = useT();
  const line = (label: string, v: number | null) => (v ? <Row key={label} style={{ justifyContent: 'space-between' }}><T.body>{label}</T.body><T.body bold>{formatPaise(v)}</T.body></Row> : null);
  return (
    <>
      {line(t('month.labour', { days: r.manDays ?? 0 }), r.labourCost)}
      {line(t('month.material'), r.material)}
      {line(t('reports.advances'), r.advances)}
      {line(t('reports.wagesPaid'), r.wagesPaid)}
      {line(t('reports.supplierPaid'), r.supplierPaid)}
    </>
  );
}

// M15: the month's account for the CA (PDF / Excel), nightly reports (open or forward), today's report on demand.
// A site's own day is shared from its page.
export default function Reports() {
  const t = useT();
  const can = useCan();
  const { me } = useSession();
  const dayName = useDayName();
  const today = useDb(() => db.today);
  const { data, error, reload } = useOnline<{ id: string; date: string; link: string }[]>('/reports/nightly/history');
  const [busy, setBusy] = useState<string | null>(null);
  const [back, setBack] = useState<0 | 1>(0);
  const range = monthRange(today, back);
  const money = can('wages', 'V');
  const month = useMonth(money && !isDemo() ? 'all' : null, range.from, range.to);
  const sites = month.rows?.filter((r) => r.manDays !== null) ?? [];
  const gets = me?.user.role === 'owner' || me?.user.role === 'engineer';
  const total = month.rows?.reduce<MonthRow>((a, r) => ({
    site: '', manDays: (a.manDays ?? 0) + (r.manDays ?? 0), labourCost: (a.labourCost ?? 0) + (r.labourCost ?? 0), material: (a.material ?? 0) + (r.material ?? 0),
    wagesPaid: (a.wagesPaid ?? 0) + (r.wagesPaid ?? 0), advances: (a.advances ?? 0) + (r.advances ?? 0), supplierPaid: (a.supplierPaid ?? 0) + (r.supplierPaid ?? 0),
  }), { site: '', manDays: 0, labourCost: 0, material: 0, wagesPaid: 0, advances: 0, supplierPaid: 0 });
  const file = (format: 'pdf' | 'xlsx') => {
    setBusy(format);
    shareReportFile('monthly', 'all', range.from, range.to, format, t('reports.monthly'))
      .catch((e: unknown) => notice(t('common.error'), e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(null));
  };

  return (
    <Screen title={t('home.reports')}>
      {isDemo() ? <Banner tone="info" text={t('demo.reportNote')} /> : null}
      {error ? <Banner tone="error" text={error === 'offline' ? t('common.offlineOnline') : error} onPress={reload} /> : null}

      {money && !isDemo() ? (
        <>
          <Section title={t('reports.monthly')} />
          <Chips options={[{ value: '0', label: t('hisab.thisMonth') }, { value: '1', label: t('reports.lastMonth') }]} value={String(back)} onChange={(v) => setBack(v === '1' ? 1 : 0)} />
          {month.error ? <Banner tone="error" text={month.error === 'offline' ? t('common.offlineOnline') : month.error} onPress={() => void month.reload()} /> : null}
          {total ? (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <T.h2>{t('month.total')}</T.h2>
                <T.h2>{formatPaise((total.labourCost ?? 0) + (total.material ?? 0))}</T.h2>
              </Row>
              <MonthLines r={total} />
              <T.small>{t('month.note')}</T.small>
              <Row>
                <Button style={{ flex: 1 }} small kind="secondary" icon="file-pdf-box" label="PDF" busy={busy === 'pdf'} onPress={() => file('pdf')} />
                <Button style={{ flex: 1 }} small kind="secondary" icon="microsoft-excel" label="Excel" busy={busy === 'xlsx'} onPress={() => file('xlsx')} />
              </Row>
            </Card>
          ) : null}
          {/* Per site when there are several; payments not tied to a site are in the total only. */}
          {sites.length > 1 ? sites.map((r) => (
            <Card key={r.site}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T.body bold>{r.site}</T.body>
                <T.body bold color={colors.primary}>{formatPaise((r.labourCost ?? 0) + (r.material ?? 0))}</T.body>
              </Row>
              <MonthLines r={r} />
            </Card>
          )) : null}
        </>
      ) : null}

      <Section title={t('reports.history')} />
      {gets ? (
        <Button kind="secondary" icon="send-clock-outline" label={t('reports.sendNow')} busy={busy === 'run'} onPress={() => {
          setBusy('run');
          post<{ link: string | null }>('/reports/nightly/run')
            .then(async (r) => { await reload(); if (r.link) await shareLink(r.link); })
            .catch((e: unknown) => notice(t('common.error'), e instanceof Error ? e.message : String(e)))
            .finally(() => setBusy(null));
        }} />
      ) : null}
      {data && !data.length ? <Empty icon="file-clock-outline" text={t('reports.none', { time: me?.company.settings.reportTime ?? '20:00' })} /> : null}
      {data?.length ? (
        <Card style={flush}>
          {data.map((r, i) => <ListRow key={r.id} icon="file-document-outline" title={dayName(r.date)} value={t('reports.open')} onPress={() => void shareLink(r.link)} last={i === data.length - 1} />)}
        </Card>
      ) : null}
      <View style={{ height: spacing.lg }} />
    </Screen>
  );
}
