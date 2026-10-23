import { formatNumber, formatPaise, isoDate, rupeesToPaise, shortDate } from '@site-diary/shared';
import { colors, spacing } from '@site-diary/ui-tokens';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Ask, Banner, Button, Card, Chips, DiaryLine, Icon, IconBadge, Input, Row, Screen, Section, Stat, T } from '../components/ui';
import { patch, post } from '../lib/api';
import { db, useDb } from '../lib/db';
import { useOnline } from '../lib/hooks';
import { useName, useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { toPaise, useSave, type Ledger } from '../lib/setup';

type Mode = 'cash' | 'upi' | 'bank';
const BY = { cash: 'advance.byCash', upi: 'advance.byUpi', bank: 'advance.byBank' } as const;

/** Rates for a receipt that came without one: each line of it, priced here. */
function PriceReceipt({ grnId, onSaved }: { grnId: string; onSaved: () => void }) {
  const t = useT();
  const name = useName();
  const { busy, run } = useSave();
  const lines = useDb(() => db.rows('grnLine').filter((l) => l.grnId === grnId));
  const [rates, setRates] = useState<Record<string, string>>({});
  return (
    <View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
      {lines.map((l) => {
        const m = db.find('material', l.materialId as string);
        return (
          <Row key={l.id}>
            <View style={{ flex: 1 }}><T.body>{name(m)} {formatNumber(Number(l.qty) - Number(l.rejectedQty ?? 0))} {String(m?.unit ?? '')}</T.body></View>
            <T.small>₹/{String(m?.unit ?? '')}</T.small>
            <Input value={rates[l.id] ?? (l.ratePaise != null ? String(Number(l.ratePaise) / 100) : '')} onChangeText={(v) => setRates((r) => ({ ...r, [l.id]: v.replace(/[^\d.]/g, '') }))} keyboardType="decimal-pad" placeholder="—" accessibilityLabel={`${name(m)} ₹`} style={{ width: 100, textAlign: 'right', fontWeight: '700' }} />
          </Row>
        );
      })}
      <Button small icon="check" label={t('common.save')} busy={busy} disabled={!Object.keys(rates).length} onPress={() => void run(async () => {
        for (const [id, v] of Object.entries(rates)) await patch(`/registers/grn-lines/${id}/rate`, { ratePaise: v ? toPaise(v) : null });
        onSaved();
      })} />
    </View>
  );
}

// One supplier's account: what is owed, every receipt and payment, a payment noted in a few taps,
// receipts without a rate priced here, and the statement sent to the supplier on WhatsApp.
export default function Supplier() {
  const t = useT();
  const { me } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const supplier = useDb(() => db.find('supplier', id));
  const { data, error, reload } = useOnline<Ledger>(`/purchase/supplier-ledger/${id}`);
  const { busy, run } = useSave();
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<Mode>('bank');
  const [open, setOpen] = useState<string | null>(null);
  const canPay = me?.user.role === 'owner' || me?.user.role === 'accountant';
  const unpriced = data?.rows.reduce((x, r) => x + r.unpricedLines, 0) ?? 0;
  const rupees = Number(amount.replace(/[^\d]/g, ''));
  const name = String(supplier?.name ?? '');
  const payLine = rupees ? t('supplier.payLine', { supplier: name, amount: formatPaise(rupeesToPaise(rupees)), mode: t(BY[mode]) }) : null;

  const pay = () => void run(async () => {
    await post('/purchase/supplier-payments', { supplierId: id, amountPaise: rupeesToPaise(rupees), date: isoDate(), mode });
    setAmount('');
    await reload();
  });
  const share = () => {
    const lines = (data?.rows ?? []).map((r) => `${shortDate(r.date.slice(0, 10))} ${r.kind === 'grn' ? `${t('supplier.received')}${r.ref ? ` (${r.ref})` : ''} ${formatPaise(r.debitPaise)}` : `${t('supplier.paid')} ${formatPaise(r.creditPaise)}`}`);
    const text = [`*${t('supplier.statement', { company: me?.company.name ?? '', supplier: name })}*`, ...lines, `*${t('supplier.due', { amount: formatPaise(data?.duePaise ?? 0) })}*`].join('\n');
    const phone = String(supplier?.phone ?? '').replace(/\D/g, '').slice(-10);
    void Linking.openURL(`https://wa.me/${phone ? `91${phone}` : ''}?text=${encodeURIComponent(text)}`);
  };

  return (
    <Screen title={name || t('supplier.title')} subtitle={supplier?.phone ? String(supplier.phone).replace('+91', '') : undefined}>
      {error ? <Banner tone="error" text={error === 'offline' ? t('common.offlineOnline') : error} onPress={() => void reload()} /> : null}
      {data ? (
        <Row style={{ alignItems: 'stretch' }}>
          <Stat value={data.duePaise > 0 ? formatPaise(data.duePaise) : unpriced ? t('supplier.rateNeeded') : t('supplier.allPaid')} label={unpriced ? t('supplier.unpriced', { count: unpriced }) : t('supplier.balance')} tone={data.duePaise > 0 || unpriced ? 'warn' : 'ok'} />
        </Row>
      ) : null}

      {canPay ? (
        <Card>
          <Ask q={t('supplier.qAmount')}>
            <Input value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="₹ 25,000" accessibilityLabel={t('supplier.qAmount')} style={{ fontSize: 22 }} />
            {data && data.duePaise > 0 ? <Chips options={[{ value: String(Math.round(data.duePaise / 100)), label: formatPaise(Math.round(data.duePaise / 100) * 100) }]} value={String(rupees)} onChange={setAmount} /> : null}
            <Chips<Mode> options={[{ value: 'bank', label: t('pay.bank') }, { value: 'upi', label: 'UPI' }, { value: 'cash', label: t('pay.cash') }]} value={mode} onChange={setMode} />
          </Ask>
          {payLine ? <DiaryLine text={payLine} /> : null}
          <Button icon="cash-check" label={t('supplier.pay')} busy={busy} disabled={!rupees} onPress={pay} />
        </Card>
      ) : null}

      {data?.rows.length ? (
        <>
          <Section title={t('supplier.title')} action={t('supplier.share')} onAction={share} />
          <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
            {[...data.rows].reverse().map((r, i) => (
              <View key={r.id} style={{ paddingVertical: spacing.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <Pressable disabled={r.kind !== 'grn'} onPress={() => setOpen(open === r.id ? null : r.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <IconBadge name={r.kind === 'grn' ? 'truck-delivery' : 'cash-check'} tone={r.kind === 'grn' ? (r.unpricedLines ? 'warn' : 'primary') : 'ok'} size={34} />
                  <View style={{ flex: 1 }}>
                    <T.body bold>{r.kind === 'grn' ? t('supplier.received') : t('supplier.paid')}{r.ref ? ` · ${r.ref}` : ''}</T.body>
                    <T.small>{shortDate(r.date.slice(0, 10))}{r.unpricedLines ? ` · ${t('supplier.rateNeeded')}` : ''} · {t('supplier.balance')} {formatPaise(r.balancePaise)}</T.small>
                  </View>
                  {r.kind === 'grn' && r.unpricedLines && !r.debitPaise ? <T.small bold color={colors.warning}>{t('supplier.setRate')}</T.small> : <T.body bold color={r.kind === 'grn' ? colors.ink : colors.success}>{r.kind === 'grn' ? formatPaise(r.debitPaise) : `−${formatPaise(r.creditPaise)}`}</T.body>}
                  {r.kind === 'grn' ? <Icon name={open === r.id ? 'chevron-up' : 'chevron-down'} size={22} color={colors.faint} /> : null}
                </Pressable>
                {open === r.id ? <PriceReceipt grnId={r.id} onSaved={() => { setOpen(null); void reload(); }} /> : null}
              </View>
            ))}
          </Card>
          <Button kind="success" icon="whatsapp" label={t('supplier.share')} onPress={share} />
        </>
      ) : null}
    </Screen>
  );
}
