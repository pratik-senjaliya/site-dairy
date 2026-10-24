import { formatNumber, formatPaise, isoDate, shortDate, wageWeek } from '@site-diary/shared';
import { colors, radius, spacing } from '@site-diary/ui-tokens';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, Share, View } from 'react-native';
import { Banner, Button, Card, Chips, Empty, Icon, Row, Screen, T } from '../components/ui';
import { db, useDb } from '../lib/db';
import { post } from '../lib/api';
import { confirm, notice, useOnline, useSite } from '../lib/hooks';
import { useDayName, useName, useT } from '../lib/i18n';
import { useSession } from '../lib/session';

interface Account {
  contractor: { id: string; name: string; phone: string | null };
  /** First day not yet settled in the period. */
  from: string;
  manDays: number; gross: number; advances: number; net: number; missingRates: string[];
  bySkill: { skillId: string; manDays: number; otHours: number; gross: number }[];
  days: { date: string; manDays: number }[];
  settledTill: string | null;
}
interface Summary { from: string; to: string; contractors: Account[]; total: { manDays: number; gross: number; advances: number; net: number } }
interface Settlement { id: string; contractorId: string; periodFrom: string; periodTo: string; netPaise: number; status: string }
type Period = 'week' | 'lastWeek' | 'month';
type Mode = 'cash' | 'upi' | 'bank';

// Contractor hisab: what each contractor has earned this week, the upad already given, and what is left to pay.
export default function Hisab() {
  const t = useT();
  const dayName = useDayName();
  const name = useName();
  const { me } = useSession();
  const { siteId: current } = useSite();
  const { site } = useLocalSearchParams<{ site?: string }>();
  const projects = me?.projects.filter((p) => p.status === 'active') ?? [];
  const [siteId, setSiteId] = useState(site ?? current ?? projects[0]?.id ?? null);
  const [period, setPeriod] = useState<Period>('week');
  const [open, setOpen] = useState<string | null>(null);
  const today = isoDate();
  const wageDay = me?.company.settings.wageDay ?? 6;
  const range = period === 'month' ? { from: `${today.slice(0, 8)}01`, to: today } : wageWeek(today, wageDay, period === 'lastWeek' ? 1 : 0);
  const { data, error, loading, reload } = useOnline<Summary>(siteId ? `/wages/summary?projectId=${siteId}&from=${range.from}&to=${range.to}` : null);
  const skills = useDb(() => db.rows('skill'));
  const skillName = (id: string) => name(skills.find((s) => s.id === id));
  const siteName = projects.find((p) => p.id === siteId)?.name ?? '';
  const shown = data && data.from === range.from && data.to === range.to ? data : null;
  const lastDay = range.to > today ? today : range.to;
  // Settling and paying is office work (owner, engineer, accountant); the owner's own settlements need no approval.
  const office = ['owner', 'engineer', 'accountant'].includes(me?.user.role ?? '');
  const settlements = useOnline<Settlement[]>(siteId && office ? `/wages?projectId=${siteId}` : null);
  const unpaid = (contractorId: string) => (settlements.data ?? []).filter((x) => x.contractorId === contractorId && (x.status === 'approved' || x.status === 'submitted'));
  const [mode, setMode] = useState<Mode>('cash');
  const [busy, setBusy] = useState<string | null>(null);
  const settledUnpaid = (settlements.data ?? []).filter((x) => x.status === 'approved' || x.status === 'submitted').reduce((sum, x) => sum + x.netPaise, 0);
  const modeName = (m: Mode) => (m === 'upi' ? 'UPI' : t(`pay.${m}`));

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      await Promise.all([reload(), settlements.reload()]);
    } catch (e) {
      notice(t('common.error'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const settle = async (a: Account) => {
    const vars = { from: shortDate(a.from), to: shortDate(lastDay), gross: formatPaise(a.gross), advances: formatPaise(a.advances), net: formatPaise(a.net) };
    if (!(await confirm(t('hisab.settleTitle', { name: a.contractor.name }), t('hisab.settleBody', vars), t('hisab.settleOk'), t('common.cancel')))) return;
    await run(a.contractor.id, async () => {
      const r = await post<{ status: string }>('/wages', { projectId: siteId, contractorId: a.contractor.id, from: a.from, to: lastDay });
      notice(t('common.saved'), r.status === 'submitted' ? t('hisab.sentForApproval') : undefined);
    });
  };
  const pay = (x: Settlement) => run(x.id, async () => {
    await post(`/wages/${x.id}/pay`, { mode });
    notice(t('hisab.paid'));
  });

  const message = (a: Account) => [
    `${siteName} · ${a.contractor.name}`,
    `${shortDate(a.from)} – ${shortDate(lastDay)}`,
    ...a.bySkill.map((s) => `${skillName(s.skillId)}: ${t('hisab.manDays', { count: s.manDays })}${s.otHours ? ` + OT ${s.otHours}h` : ''} · ${formatPaise(s.gross)}`),
    `${t('hisab.earned')}: ${formatPaise(a.gross)}`,
    ...(a.advances ? [`${t('hisab.advance')}: −${formatPaise(a.advances)}`] : []),
    `${t('hisab.payable')}: ${formatPaise(a.net)}`,
  ].join('\n');

  const send = (a: Account) => {
    const text = message(a);
    const phone = a.contractor.phone?.replace(/\D/g, '').slice(-10);
    if (phone?.length === 10) return void Linking.openURL(`https://wa.me/91${phone}?text=${encodeURIComponent(text)}`);
    if (Platform.OS === 'web') return void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`);
    void Share.share({ message: text });
  };

  return (
    <Screen title={t('home.hisab')}>
      {projects.length > 1 ? <Chips options={projects.map((p) => ({ value: p.id, label: p.name }))} value={siteId} onChange={setSiteId} /> : null}
      <Chips<Period> options={[{ value: 'week', label: t('hisab.thisWeek') }, { value: 'lastWeek', label: t('hisab.lastWeek') }, { value: 'month', label: t('hisab.thisMonth') }]} value={period} onChange={setPeriod} />
      <T.small>{shortDate(range.from)} – {shortDate(lastDay)} · {t('hisab.hint')}</T.small>
      {error ? <Banner tone="error" text={error === 'offline' ? t('common.offlineOnline') : error} onPress={reload} /> : null}
      {!shown && loading ? <T.small>{t('common.loading')}</T.small> : null}
      {shown ? (
        <>
          <Card>
            <T.small>{t('hisab.total')}</T.small>
            <T.big color={colors.primary}>{formatPaise(shown.contractors.reduce((sum, a) => sum + Math.max(0, a.net), 0) + settledUnpaid)}</T.big>
            {settledUnpaid ? <T.small>{t('hisab.inSettlements', { amount: formatPaise(settledUnpaid) })}</T.small> : null}
            <T.small>{t('hisab.manDays', { count: shown.total.manDays })} · {t('hisab.earned')} {formatPaise(shown.total.gross)} · {t('hisab.advance')} {formatPaise(shown.total.advances)}</T.small>
          </Card>
          {!shown.contractors.length ? <Empty text={t('hisab.none')} /> : null}
          {shown.contractors.map((a) => (
            <Card key={a.contractor.id}>
              <Pressable onPress={() => setOpen(open === a.contractor.id ? null : a.contractor.id)} style={{ gap: spacing.xs }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <T.h2>{a.contractor.name}</T.h2>
                    <T.small>{t('hisab.manDays', { count: a.manDays })}{a.settledTill ? ` · ${t('hisab.settledTill', { date: shortDate(a.settledTill) })}` : ''}</T.small>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T.small>{t('hisab.payable')}</T.small>
                    <T.h2>{formatPaise(a.net)}</T.h2>
                  </View>
                  <Icon name={open === a.contractor.id ? 'chevron-up' : 'chevron-down'} size={24} color={colors.faint} />
                </Row>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T.body>{t('hisab.earned')} {formatPaise(a.gross)}</T.body>
                  {a.advances ? <T.body color={colors.warning}>{t('hisab.advance')} −{formatPaise(a.advances)}</T.body> : null}
                </Row>
              </Pressable>
              {unpaid(a.contractor.id).map((x) => (
                <View key={x.id} style={{ gap: spacing.sm }}>
                  <T.body bold color={x.status === 'approved' ? colors.primary : colors.muted}>
                    {t(x.status === 'approved' ? 'hisab.due' : 'hisab.waiting', { from: shortDate(x.periodFrom), to: shortDate(x.periodTo), amount: formatPaise(x.netPaise) })}
                  </T.body>
                  {x.status === 'approved' ? (
                    <Row style={{ flexWrap: 'wrap' }}>
                      <Chips<Mode> options={(['cash', 'upi', 'bank'] as const).map((m) => ({ value: m, label: modeName(m) }))} value={mode} onChange={setMode} />
                      <Button small label={t('hisab.markPaid', { mode: modeName(mode) })} busy={busy === x.id} onPress={() => void pay(x)} />
                    </Row>
                  ) : null}
                </View>
              ))}
              {a.missingRates.length ? <T.small color={colors.danger}>{t('hisab.missingRates', { skills: a.missingRates.map(skillName).join(', ') })}</T.small> : null}
              {a.net < 0 ? <T.small color={colors.warning}>{t('hisab.carry')}</T.small> : null}
              {open === a.contractor.id ? (
                <View style={{ gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
                  {a.bySkill.map((s) => (
                    <Row key={s.skillId} style={{ justifyContent: 'space-between' }}>
                      <T.body>{skillName(s.skillId)} · {t('hisab.manDays', { count: s.manDays })}{s.otHours ? ` + OT ${s.otHours}h` : ''}</T.body>
                      <T.body bold>{formatPaise(s.gross)}</T.body>
                    </Row>
                  ))}
                  <T.small>{t('hisab.byDay')}</T.small>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                    {a.days.map((d) => (
                      <View key={d.date} style={{ minWidth: 64, alignItems: 'center', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}>
                        <T.small>{dayName(d.date).split(' ')[0]}</T.small>
                        <T.small>{shortDate(d.date)}</T.small>
                        <T.body bold>{formatNumber(d.manDays)}</T.body>
                      </View>
                    ))}
                  </View>
                  <Button kind="secondary" small label={t('hisab.send')} onPress={() => send(a)} />
                  {office && a.manDays > 0 && !a.missingRates.length && a.from <= lastDay ? (
                    <Button small label={t('hisab.settle', { from: shortDate(a.from), to: shortDate(lastDay) })} busy={busy === a.contractor.id} onPress={() => void settle(a)} />
                  ) : null}
                </View>
              ) : null}
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
