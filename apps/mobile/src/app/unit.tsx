import { formatPaise, rupeesToPaise, shortDate } from '@site-diary/shared';
import { colors, spacing } from '@site-diary/ui-tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { openTel } from '../components/FieldHome';
import { useModeText } from '../components/pickers';
import { Ask, Banner, Button, Card, Chips, DiaryLine, Empty, Input, Row, Screen, Section, T, Totals } from '../components/ui';
import { del, post } from '../lib/api';
import { confirm, done, useCan, useOnline } from '../lib/hooks';
import { useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { useSave, type Book } from '../lib/setup';

// One flat: its buyer and deal, every payment the buyer made, what is still due, the account sent to the buyer.
// Without an id (or after "edit") it is the form for a new flat.
export default function UnitScreen() {
  const t = useT();
  const can = useCan();
  const { me } = useSession();
  const params = useLocalSearchParams<{ id?: string; site?: string }>();
  const { data, error, reload } = useOnline<Book>('/accounts');
  const unit = data?.units.find((u) => u.id === params.id);
  const [editing, setEditing] = useState(!params.id);
  const modeText = useModeText();
  const sites = me?.projects.filter((p) => p.status === 'active') ?? [];
  const [site, setSite] = useState<string | null>(params.site ?? (sites.length === 1 ? sites[0]!.id : null));
  const [name, setName] = useState('');
  const [buyer, setBuyer] = useState('');
  const [phone, setPhone] = useState('');
  const [deal, setDeal] = useState('');
  const { busy, run } = useSave();
  useEffect(() => {
    if (!unit) return;
    setSite(unit.projectId);
    setName(unit.name);
    setBuyer(unit.buyerName ?? '');
    setPhone(unit.buyerPhone ?? '');
    setDeal(unit.dealPaise != null ? String(Math.round(unit.dealPaise / 100)) : '');
  }, [unit]);

  const dealRupees = Number(deal.replace(/[^\d]/g, ''));
  if (editing) {
    const ok = !!site && name.trim().length > 0;
    return (
      <Screen
        title={params.id ? name || t('unit.title') : t('unit.new')}
        footer={
          <>
            {ok ? <DiaryLine text={t('unit.will', { name: name.trim(), buyer: buyer.trim() || t('accounts.unsold'), amount: dealRupees ? formatPaise(rupeesToPaise(dealRupees)) : '—' })} /> : null}
            <Button icon="check" label={t('common.save')} busy={busy} disabled={!ok} onPress={() => void run(async () => {
              await post('/accounts/units', { id: params.id ?? randomUUID(), projectId: site, name: name.trim(), buyerName: buyer.trim() || null, buyerPhone: phone.replace(/\D/g, '') || null, dealPaise: dealRupees ? rupeesToPaise(dealRupees) : null });
              if (params.id) {
                setEditing(false);
                void reload();
              } else done();
            })} />
          </>
        }
      >
        {sites.length > 1 ? (
          <Ask q={t('unit.qSite')}>
            <Chips<string> options={sites.map((p) => ({ value: p.id, label: p.name }))} value={site} onChange={setSite} />
          </Ask>
        ) : null}
        <Ask q={t('unit.qName')}>
          <Input value={name} onChangeText={setName} placeholder="A-101" accessibilityLabel={t('unit.qName')} autoCapitalize="characters" maxLength={60} style={{ fontSize: 20 }} />
        </Ask>
        <Ask q={t('unit.qBuyer')} optional>
          <Input value={buyer} onChangeText={setBuyer} placeholder="Mahendrabhai Patel" accessibilityLabel={t('unit.qBuyer')} maxLength={120} />
        </Ask>
        <Ask q={t('unit.qPhone')} optional>
          <Input value={phone} onChangeText={setPhone} placeholder="98250 12345" accessibilityLabel={t('unit.qPhone')} keyboardType="phone-pad" maxLength={14} />
        </Ask>
        <Ask q={t('unit.qDeal')} optional>
          <Input value={deal} onChangeText={setDeal} placeholder="₹ 45,00,000" accessibilityLabel={t('unit.qDeal')} keyboardType="number-pad" style={{ fontSize: 22 }} />
          {dealRupees ? <Banner tone="ok" text={formatPaise(rupeesToPaise(dealRupees))} /> : null}
        </Ask>
      </Screen>
    );
  }

  const payments = (data?.lines ?? []).filter((l) => l.unitId === params.id);
  const write = can('accounts', 'C');
  const share = () => {
    if (!unit) return;
    const lines = payments.filter((l) => !l.removed).map((l) => `${shortDate(l.date)} ${formatPaise(l.amountPaise)} ${modeText(l.mode, l.reference)}`);
    const text = [
      `*${t('unit.statement', { company: me?.company.name ?? '', name: [unit.name, unit.buyerName].filter(Boolean).join(' — ') })}*`,
      ...(unit.dealPaise != null ? [t('accounts.deal', { amount: formatPaise(unit.dealPaise) })] : []),
      ...lines,
      `*${t('accounts.received', { amount: formatPaise(unit.receivedPaise) })}*`,
      ...(unit.duePaise ? [`*${t('accounts.due', { amount: formatPaise(unit.duePaise) })}*`] : []),
    ].join('\n');
    const digits = (unit.buyerPhone ?? '').replace(/\D/g, '').slice(-10);
    void Linking.openURL(`https://wa.me/${digits ? `91${digits}` : ''}?text=${encodeURIComponent(text)}`);
  };

  return (
    <Screen
      title={unit ? unit.name : t('unit.title')}
      subtitle={unit?.buyerName ?? undefined}
      footer={write && unit ? <Button kind="success" icon="arrow-down-bold" label={t('accounts.addIn')} onPress={() => router.push({ pathname: '/money', params: { dir: 'in', unit: unit.id, site: unit.projectId } })} /> : undefined}
    >
      {error ? <Banner tone="error" text={error === 'offline' ? t('common.offlineOnline') : error} onPress={() => void reload()} /> : null}
      {unit ? (
        <>
          <Totals rows={[
            ...(unit.dealPaise != null ? [{ label: t('unit.qDeal'), value: formatPaise(unit.dealPaise) }] : []),
            { label: t('accounts.in'), value: formatPaise(unit.receivedPaise), tone: 'ok' as const },
            ...(unit.duePaise != null ? [{ label: t('supplier.balance'), value: formatPaise(unit.duePaise), tone: unit.duePaise ? ('warn' as const) : ('ok' as const), bold: true }] : []),
          ]} />
          <Row>
            {unit.buyerPhone ? <Button style={{ flex: 1 }} small kind="secondary" icon="phone" label={unit.buyerName?.split(' ')[0] ?? unit.buyerPhone} onPress={() => openTel(unit.buyerPhone!)} /> : null}
            {write ? <Button style={{ flex: 1 }} small kind="secondary" icon="pencil-outline" label={t('common.edit')} onPress={() => setEditing(true)} /> : null}
          </Row>
          <Section title={t('unit.payments')} />
          {!payments.length ? <Empty icon="cash" text={t('unit.noPayments')} /> : (
            <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
              {payments.map((l, i) => (
                <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                  <View style={{ flex: 1 }}>
                    <T.body bold color={l.removed ? colors.faint : undefined}>{shortDate(l.date)} · {modeText(l.mode, l.reference)}</T.body>
                    <T.small color={l.removed ? colors.danger : undefined}>{l.removed ? t('accounts.removedBy', { name: l.removed.by ?? '', date: shortDate(l.removed.at.slice(0, 10)) }) : t('accounts.by', { name: l.by ?? '—' })}</T.small>
                  </View>
                  <T.body bold color={l.removed ? colors.faint : colors.success}>{formatPaise(l.amountPaise)}</T.body>
                </View>
              ))}
            </Card>
          )}
          <Button kind="success" icon="whatsapp" label={t('unit.share')} onPress={share} />
          {write && !payments.some((l) => !l.removed) ? (
            <Button kind="ghost" icon="delete-outline" label={t('unit.remove')} onPress={() => void (async () => {
              if (!(await confirm(t('unit.remove'), unit.name, t('accounts.removeOk'), t('common.cancel')))) return;
              if (await run(async () => void (await del(`/accounts/units/${unit.id}`)))) done();
            })()} />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
