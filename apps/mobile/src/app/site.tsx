import { noticeText, type Notice } from '@site-diary/i18n';
import { addDays, formatPaise, isoDate, shortDate } from '@site-diary/shared';
import { colors, spacing } from '@site-diary/ui-tokens';
import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PhotoThumb } from '../components/Photo';
import { Banner, Button, Card, Row, s, Screen, T } from '../components/ui';
import { notice, useOnline } from '../lib/hooks';
import { shareDailyReport } from '../lib/share';
import { useDayName, useT } from '../lib/i18n';
import { useSession } from '../lib/session';

interface SiteDetail {
  project: { name: string }; date: string; marker: string; note: string | null;
  labour: { workers: number; yesterday: number; avg7: number; costPaise: number; costMissingRates: boolean; byContractor: { contractor: string; workers: number }[] };
  materialIn: { material: string; materialGu: string; qty: number; unit: string; supplier: string | null }[];
  materialUsed: { material: string; materialGu: string; qty: number; unit: string; floor: string | null }[];
  progress: { workItem: string; workItemGu: string; floor: string | null; percent: number; note: string | null }[];
  photos: unknown[]; openIssues: number; alerts: Notice[]; missing: string[];
  trend: { date: string; workers: number }[];
}

// M14: one site's day (today, or any earlier day), with the 14-day labour trend.
export default function Site() {
  const t = useT();
  const dayName = useDayName();
  const { lang } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = isoDate();
  const [date, setDate] = useState(today);
  const [sending, setSending] = useState(false);
  const { data, error, reload } = useOnline<SiteDetail>(id ? `/dashboard/site/${id}?date=${date}` : null);
  const d = data?.date === date ? data : null;
  const photos = useOnline<{ id: string; uploaded: boolean; sourceType: string }[]>(id && d ? `/registers/photos?projectId=${id}&from=${d.date}&to=${d.date}` : null);
  const nm = (en: string, gu: string) => (lang === 'en' ? en : gu || en);
  const max = Math.max(1, ...(d?.trend.map((x) => x.workers) ?? [1]));

  return (
    <Screen
      title={data?.project.name ?? ''}
      footer={id ? (
        <Button kind="secondary" label={t('home.pdf')} busy={sending} onPress={() => {
          setSending(true);
          shareDailyReport(id, t('home.reportShareTitle'), date)
            .catch((e: unknown) => notice(t('home.reportFailed'), e instanceof Error ? e.message : String(e)))
            .finally(() => setSending(false));
        }} />
      ) : undefined}
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.prevDay')} onPress={() => setDate(addDays(date, -1))} style={s.stepBtn}><Text style={s.stepSign}>‹</Text></Pressable>
        <T.h2>{date === today ? t('common.today') : dayName(date)}</T.h2>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.nextDay')} disabled={date >= today} onPress={() => setDate(addDays(date, 1))} style={[s.stepBtn, date >= today && { opacity: 0.3 }]}><Text style={s.stepSign}>›</Text></Pressable>
      </Row>
      {error ? <Banner tone="error" text={error === 'offline' ? t('common.offlineOnline') : error} onPress={reload} /> : null}
      {d ? (
        <>
          {d.alerts.map((a) => noticeText(lang, a)).map((a) => <Banner key={a} text={a} />)}
          <Row style={{ gap: spacing.md }}>
            <Card style={{ flex: 1 }}><T.big>{d.labour.workers}</T.big><T.small>{t('report.workers')}</T.small></Card>
            <Card style={{ flex: 1 }}><T.big>{d.labour.yesterday}</T.big><T.small>{t('report.yesterday')}</T.small></Card>
            <Card style={{ flex: 1 }}><T.big>{d.labour.avg7}</T.big><T.small>{t('report.avg7')}</T.small></Card>
          </Row>
          <Card>
            <T.h2>{t('site.trend')}</T.h2>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 4 }} accessibilityLabel={d.trend.map((x) => `${x.date}: ${x.workers}`).join(', ')}>
              {d.trend.map((x) => (
                <Pressable key={x.date} accessibilityLabel={`${dayName(x.date)}: ${x.workers}`} onPress={() => setDate(x.date)} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <View style={{ width: '100%', height: `${(x.workers / max) * 100}%`, minHeight: 2, backgroundColor: x.date === d.date ? colors.primary : colors.border, borderRadius: 3 }} />
                </Pressable>
              ))}
            </View>
            <Row style={{ justifyContent: 'space-between' }}><T.small>{shortDate(d.trend[0]?.date ?? date)}</T.small><T.small>{t('site.trendHint')}</T.small><T.small>{shortDate(d.trend.at(-1)?.date ?? date)}</T.small></Row>
          </Card>
          {d.labour.costPaise ? (
            <Card onPress={() => router.push({ pathname: '/hisab', params: { site: id } })}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T.body>{date === today ? t('owner.labourCost') : t('owner.labourCostDay')}{d.labour.costMissingRates ? ` · ${t('owner.costMissing')}` : ''}</T.body>
                <T.h2>{formatPaise(d.labour.costPaise)}</T.h2>
              </Row>
            </Card>
          ) : null}
          {/* Only what was written that day; one line when nothing was. */}
          {!d.labour.byContractor.length && !d.materialIn.length && !d.materialUsed.length && !d.progress.length ? (
            <Card><T.body muted>{date === today ? t('owner.notWritten') : t('home.dayEmpty')}</T.body></Card>
          ) : null}
          {d.labour.byContractor.length ? (
            <Card>
              <T.h2>{t('report.labour')}</T.h2>
              {d.labour.byContractor.map((c) => <Row key={c.contractor} style={{ justifyContent: 'space-between' }}><T.body>{c.contractor}</T.body><T.body bold>{c.workers}</T.body></Row>)}
            </Card>
          ) : null}
          {d.materialIn.length ? (
            <Card>
              <T.h2>{t('report.materialIn')}</T.h2>
              {d.materialIn.map((m, i) => <T.body key={i}>{nm(m.material, m.materialGu)} · {m.qty} {m.unit}{m.supplier ? ` · ${m.supplier}` : ''}</T.body>)}
            </Card>
          ) : null}
          {d.materialUsed.length ? (
            <Card>
              <T.h2>{t('report.materialUsed')}</T.h2>
              {d.materialUsed.map((m, i) => <T.body key={i}>{nm(m.material, m.materialGu)} · {m.qty} {m.unit}{m.floor ? ` · ${m.floor}` : ''}</T.body>)}
            </Card>
          ) : null}
          {d.progress.length ? (
            <Card>
              <T.h2>{t('report.progress')}</T.h2>
              {d.progress.map((p, i) => <T.body key={i}>{nm(p.workItem, p.workItemGu)}{p.floor ? ` · ${p.floor}` : ''} · {p.percent}%{p.note ? `\n${p.note}` : ''}</T.body>)}
            </Card>
          ) : null}
          {d.photos.length ? (
            <Card>
              <T.h2>{t('site.photos')} ({d.photos.length})</T.h2>
              <Row style={{ flexWrap: 'wrap' }}>
                {photos.data?.filter((p) => p.uploaded).map((p) => <PhotoThumb key={p.id} photo={p} size={100} />)}
              </Row>
            </Card>
          ) : null}
          <T.small>{t('report.openIssues')}: {d.openIssues}</T.small>
        </>
      ) : null}
    </Screen>
  );
}
