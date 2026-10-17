import { useState } from 'react';
import { Banner, Button, Card, Empty, Row, Screen, T } from '../components/ui';
import { post } from '../lib/api';
import { notice, useOnline, useSite } from '../lib/hooks';
import { useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { shareDailyReport, shareLink } from '../lib/share';

// M15: nightly reports (open or forward the link) and today's report on demand.
export default function Reports() {
  const t = useT();
  const { me } = useSession();
  const { siteId } = useSite();
  const { data, error, reload } = useOnline<{ id: string; date: string; link: string }[]>('/reports/nightly/history');
  const [busy, setBusy] = useState(false);
  const gets = me?.user.role === 'owner' || me?.user.role === 'engineer';

  return (
    <Screen title={t('home.reports')}>
      {error ? <Banner tone="error" text={error === 'offline' ? t('common.offlineOnline') : error} onPress={reload} /> : null}
      {gets ? (
        <Button label={t('reports.sendNow')} busy={busy} onPress={() => {
          setBusy(true);
          post<{ link: string | null }>('/reports/nightly/run')
            .then(async (r) => { await reload(); if (r.link) await shareLink(r.link); })
            .catch((e: unknown) => notice(t('common.error'), e instanceof Error ? e.message : String(e)))
            .finally(() => setBusy(false));
        }} />
      ) : null}
      {siteId ? <Button kind="secondary" label={t('reports.todayPdf')} onPress={() => void shareDailyReport(siteId, t('home.reportShareTitle')).catch((e: unknown) => notice(t('common.error'), String(e)))} /> : null}
      <T.h2>{t('reports.history')}</T.h2>
      {data && !data.length ? <Empty text={t('reports.none', { time: me?.company.settings.reportTime ?? '20:00' })} /> : null}
      {data?.map((r) => (
        <Card key={r.id} onPress={() => void shareLink(r.link)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T.body bold>{r.date}</T.body>
            <T.small>{t('reports.open')} ›</T.small>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
