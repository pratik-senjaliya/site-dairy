import { formatPaise } from '@site-diary/shared';
import { colors, spacing } from '@site-diary/ui-tokens';
import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { PhotoThumb } from '../components/Photo';
import { Banner, Card, Row, Screen, T } from '../components/ui';
import { useOnline } from '../lib/hooks';
import { useT } from '../lib/i18n';
import { useSession } from '../lib/session';

interface SiteDetail {
  project: { name: string }; date: string; marker: string; note: string | null;
  labour: { workers: number; yesterday: number; avg7: number; costPaise: number; costMissingRates: boolean; byContractor: { contractor: string; workers: number }[] };
  materialIn: { material: string; materialGu: string; qty: number; unit: string; supplier: string | null }[];
  materialUsed: { material: string; materialGu: string; qty: number; unit: string; floor: string | null }[];
  progress: { workItem: string; workItemGu: string; floor: string | null; percent: number; note: string | null }[];
  photos: unknown[]; openIssues: number; alerts: string[]; missing: string[];
  trend: { date: string; workers: number }[];
}

// M14: one site today, with the 14-day labour trend.
export default function Site() {
  const t = useT();
  const { lang } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: d, error, reload } = useOnline<SiteDetail>(id ? `/dashboard/site/${id}` : null);
  const photos = useOnline<{ id: string; uploaded: boolean; sourceType: string }[]>(id && d ? `/registers/photos?projectId=${id}&from=${d.date}&to=${d.date}` : null);
  const nm = (en: string, gu: string) => (lang === 'en' ? en : gu || en);
  const max = Math.max(1, ...(d?.trend.map((x) => x.workers) ?? [1]));

  return (
    <Screen title={d?.project.name ?? ''}>
      {error ? <Banner tone="error" text={error === 'offline' ? t('common.offlineOnline') : error} onPress={reload} /> : null}
      {d ? (
        <>
          {d.alerts.map((a) => <Banner key={a} text={a} />)}
          <Row style={{ gap: spacing.md }}>
            <Card style={{ flex: 1 }}><T.big>{d.labour.workers}</T.big><T.small>{t('report.workers')}</T.small></Card>
            <Card style={{ flex: 1 }}><T.big>{d.labour.yesterday}</T.big><T.small>{t('report.yesterday')}</T.small></Card>
            <Card style={{ flex: 1 }}><T.big>{d.labour.avg7}</T.big><T.small>{t('report.avg7')}</T.small></Card>
          </Row>
          <Card>
            <T.h2>{t('site.trend')}</T.h2>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 4 }} accessibilityLabel={d.trend.map((x) => `${x.date}: ${x.workers}`).join(', ')}>
              {d.trend.map((x) => (
                <View key={x.date} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <View style={{ width: '100%', height: `${(x.workers / max) * 100}%`, backgroundColor: x.date === d.date ? colors.primary : colors.border, borderRadius: 3 }} />
                </View>
              ))}
            </View>
            <Row style={{ justifyContent: 'space-between' }}><T.small>{d.trend[0]?.date.slice(5)}</T.small><T.small>{d.trend.at(-1)?.date.slice(5)}</T.small></Row>
          </Card>
          {d.labour.costPaise ? (
            <Card onPress={() => router.push({ pathname: '/hisab', params: { site: id } })}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T.body>{t('owner.labourCost')}{d.labour.costMissingRates ? ` · ${t('owner.costMissing')}` : ''}</T.body>
                <T.h2>{formatPaise(d.labour.costPaise)}</T.h2>
              </Row>
            </Card>
          ) : null}
          <Card>
            <T.h2>{t('report.labour')}</T.h2>
            {d.labour.byContractor.length ? d.labour.byContractor.map((c) => <Row key={c.contractor} style={{ justifyContent: 'space-between' }}><T.body>{c.contractor}</T.body><T.body bold>{c.workers}</T.body></Row>) : <T.small>{t('report.nothing')}</T.small>}
          </Card>
          <Card>
            <T.h2>{t('report.materialIn')}</T.h2>
            {d.materialIn.length ? d.materialIn.map((m, i) => <T.body key={i}>{nm(m.material, m.materialGu)} · {m.qty} {m.unit}{m.supplier ? ` · ${m.supplier}` : ''}</T.body>) : <T.small>{t('report.nothing')}</T.small>}
          </Card>
          <Card>
            <T.h2>{t('report.materialUsed')}</T.h2>
            {d.materialUsed.length ? d.materialUsed.map((m, i) => <T.body key={i}>{nm(m.material, m.materialGu)} · {m.qty} {m.unit}{m.floor ? ` · ${m.floor}` : ''}</T.body>) : <T.small>{t('report.nothing')}</T.small>}
          </Card>
          <Card>
            <T.h2>{t('report.progress')}</T.h2>
            {d.progress.length ? d.progress.map((p, i) => <T.body key={i}>{nm(p.workItem, p.workItemGu)}{p.floor ? ` · ${p.floor}` : ''} · {p.percent}%{p.note ? `\n${p.note}` : ''}</T.body>) : <T.small>{t('report.nothing')}</T.small>}
          </Card>
          <Card>
            <T.h2>{t('site.photos')} ({d.photos.length})</T.h2>
            <Row style={{ flexWrap: 'wrap' }}>
              {photos.data?.filter((p) => p.uploaded).map((p) => <PhotoThumb key={p.id} photo={p} size={100} />)}
            </Row>
          </Card>
          <T.small>{t('report.openIssues')}: {d.openIssues}</T.small>
        </>
      ) : null}
    </Screen>
  );
}
