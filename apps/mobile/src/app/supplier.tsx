import { formatNumber, formatPaise, isoDate, rupeesToPaise, shortDate, type PayMode } from '@site-diary/shared';
import { colors, spacing } from '@site-diary/ui-tokens';
import { useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { DayStep, PayModeField, QtyField, RowChips, useMaterials, useModeText } from '../components/pickers';
import { Ask, Banner, Button, Card, Chips, DiaryLine, Icon, IconBadge, Input, Row, Screen, Section, Stat, T } from '../components/ui';
import { patch, post } from '../lib/api';
import { db, useDb } from '../lib/db';
import { useCan, useOnline } from '../lib/hooks';
import { useName, useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { toPaise, useSave, type Ledger } from '../lib/setup';

/** "સળિયા (TMT) 2,500 kg @ ₹62": what came on a receipt. */
function useItemText() {
  const name = useName();
  return (i: { materialId: string; qty: number; ratePaise: number | null }) => {
    const m = db.find('material', i.materialId);
    return `${name(m)} ${formatNumber(i.qty)} ${String(m?.unit ?? '')}${i.ratePaise != null ? ` @ ${formatPaise(i.ratePaise)}` : ''}`;
  };
}

/**
 * The owner notes a party's bill himself (steel ordered from 3–4 parties, often for another site): which site,
 * which day, what and how much at what rate. It is a material receipt like the store keeper's, so stock and the
 * party's account both follow.
 */
function NoteBill({ supplierId, supplierName, onSaved }: { supplierId: string; supplierName: string; onSaved: () => void }) {
  const t = useT();
  const name = useName();
  const { me } = useSession();
  const materials = useMaterials();
  const sites = me?.projects.filter((p) => p.status === 'active') ?? [];
  const [site, setSite] = useState<string | null>(sites.length === 1 ? sites[0]!.id : null);
  const [date, setDate] = useState(isoDate());
  const [materialId, setMaterial] = useState<string | null>(null);
  const [qty, setQty] = useState(0);
  const [rate, setRate] = useState('');
  const [billNo, setBillNo] = useState('');
  const { busy, run } = useSave();
  const m = useDb(() => (materialId ? db.find('material', materialId) : undefined));
  const ratePaise = rate ? toPaise(rate) : null;
  const ok = !!site && !!materialId && qty > 0;
  const amount = ratePaise ? ` · ${formatPaise(Math.round(qty * ratePaise))}` : '';
  return (
    <Card>
      {sites.length > 1 ? <Ask q={t('money.qSite')}><Chips<string> options={sites.map((p) => ({ value: p.id, label: p.name }))} value={site} onChange={setSite} /></Ask> : null}
      <Ask q={t('money.qDate')}><DayStep value={date} onChange={setDate} /></Ask>
      <Ask q={t('supplier.billQ')}>
        <RowChips label="" rows={materials} max={8} value={materialId} onChange={setMaterial} nameOf={(r) => name(r)} />
      </Ask>
      {m ? <QtyField label="" unit={String(m.unit ?? '')} value={qty} onChange={setQty} /> : null}
      {m ? (
        <Ask q={t('supplier.rateQ', { unit: String(m.unit ?? '') })} optional>
          <Input value={rate} onChangeText={(v) => setRate(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="₹ 62" accessibilityLabel={t('supplier.rateQ', { unit: String(m.unit ?? '') })} />
        </Ask>
      ) : null}
      <Ask q={t('supplier.billNo')} optional>
        <Input value={billNo} onChangeText={setBillNo} placeholder="SS-1042" accessibilityLabel={t('supplier.billNo')} maxLength={60} />
      </Ask>
      {ok ? <DiaryLine text={t('supplier.billLine', { supplier: supplierName, item: `${name(m)} ${formatNumber(qty)} ${String(m?.unit ?? '')}`, date: shortDate(date), amount })} /> : null}
      <Button icon="check" label={t('common.save')} busy={busy} disabled={!ok} onPress={() => void run(async () => {
        const grnId = randomUUID();
        db.save('grn', { id: grnId, projectId: site, supplierId, poId: null, challanNo: billNo.trim() || null, vehicleNo: null, date, note: null });
        db.save('grnLine', { id: randomUUID(), grnId, materialId, qty, rejectedQty: 0, ratePaise });
        await db.sync();
        onSaved();
      })} />
    </Card>
  );
}

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
  const [mode, setMode] = useState<PayMode>('cheque');
  const [reference, setReference] = useState('');
  const [payDate, setPayDate] = useState(isoDate());
  const sites = me?.projects.filter((p) => p.status === 'active') ?? [];
  const [paySite, setPaySite] = useState<string>(sites.length === 1 ? sites[0]!.id : '');
  const [open, setOpen] = useState<string | null>(null);
  const [billing, setBilling] = useState(false);
  const can = useCan();
  const modeText = useModeText();
  const itemText = useItemText();
  const canPay = me?.user.role === 'owner' || me?.user.role === 'accountant';
  const unpriced = data?.rows.reduce((x, r) => x + r.unpricedLines, 0) ?? 0;
  const rupees = Number(amount.replace(/[^\d]/g, ''));
  const name = String(supplier?.name ?? '');
  const payReady = rupees > 0 && (mode !== 'cheque' || reference.trim().length > 0);
  const payLine = payReady ? `${t('supplier.payLine', { supplier: name, amount: formatPaise(rupeesToPaise(rupees)), mode: modeText(mode, reference.trim() || null) })} — ${shortDate(payDate)}` : null;
  const siteName = (pid: string | null) => (sites.length > 1 ? sites.find((p) => p.id === pid)?.name ?? '' : '');

  const pay = () => void run(async () => {
    await post('/purchase/supplier-payments', { supplierId: id, projectId: paySite || null, amountPaise: rupeesToPaise(rupees), date: payDate, mode, reference: reference.trim() || null });
    setAmount('');
    setReference('');
    await reload();
  });
  const share = () => {
    const lines = (data?.rows ?? []).map((r) => `${shortDate(r.date.slice(0, 10))} ${r.kind === 'grn' ? `${t('supplier.received')}${r.ref ? ` (${r.ref})` : ''}: ${(r.items ?? []).map(itemText).join(', ')} = ${formatPaise(r.debitPaise)}` : `${t('supplier.paid')} ${formatPaise(r.creditPaise)} ${modeText(r.mode, r.ref)}`}`);
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
          </Ask>
          <Ask q={t('money.qMode')}>
            <PayModeField mode={mode} onMode={setMode} reference={reference} onReference={setReference} />
          </Ask>
          <Ask q={t('supplier.qWhen')}>
            <DayStep value={payDate} onChange={setPayDate} />
          </Ask>
          {sites.length > 1 ? (
            <Ask q={t('money.qSite')} optional>
              <Chips<string> options={[...sites.map((p) => ({ value: p.id, label: p.name })), { value: '', label: t('money.noSite') }]} value={paySite} onChange={setPaySite} />
            </Ask>
          ) : null}
          {payLine ? <DiaryLine text={payLine} /> : null}
          <Button icon="cash-check" label={t('supplier.pay')} busy={busy} disabled={!payReady} onPress={pay} />
        </Card>
      ) : null}

      {can('store', 'C') ? (
        billing
          ? <NoteBill supplierId={id} supplierName={name} onSaved={() => { setBilling(false); void reload(); }} />
          : <Button kind="secondary" icon="truck-delivery-outline" label={t('supplier.bill')} onPress={() => setBilling(true)} />
      ) : null}

      {data?.rows.length ? (
        <>
          <Section title={t('supplier.title')} />
          <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
            {[...data.rows].reverse().map((r, i) => (
              <View key={r.id} style={{ paddingVertical: spacing.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <Pressable disabled={r.kind !== 'grn'} onPress={() => setOpen(open === r.id ? null : r.id)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
                  <IconBadge name={r.kind === 'grn' ? 'truck-delivery' : 'cash-check'} tone={r.kind === 'grn' ? (r.unpricedLines ? 'warn' : 'primary') : 'ok'} size={34} />
                  {/* What it was and the amount on one line; date, challan and balance under them, full width. */}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Row style={{ alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}><T.body bold>{r.kind === 'grn' ? (r.items?.length ? r.items.map(itemText).join(', ') : t('supplier.received')) : `${t('supplier.paid')} ${modeText(r.mode, r.ref)}`}</T.body></View>
                      {/* No amount until the rate is in; the line under it says "rate pending". */}
                      {r.kind === 'grn' && r.unpricedLines && !r.debitPaise ? null : <T.body bold color={r.kind === 'grn' ? colors.ink : colors.success}>{r.kind === 'grn' ? formatPaise(r.debitPaise) : `−${formatPaise(r.creditPaise)}`}</T.body>}
                    </Row>
                    <Row style={{ alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}><T.small>{[shortDate(r.date.slice(0, 10)), r.kind === 'grn' && r.ref ? r.ref : '', siteName(r.projectId), r.unpricedLines ? t('supplier.rateNeeded') : ''].filter(Boolean).join(' · ')} · {t('supplier.balance')} {formatPaise(r.balancePaise)}</T.small></View>
                      {r.kind === 'grn' ? <Icon name={open === r.id ? 'chevron-up' : 'chevron-down'} size={22} color={colors.faint} /> : null}
                    </Row>
                  </View>
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
