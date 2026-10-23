import { formatNumber, isoDate, shortDate } from '@site-diary/shared';
import { colors, spacing } from '@site-diary/ui-tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { QuickAdd, QtyField, RowChips, byUse } from '../components/pickers';
import { Ask, Banner, Button, Card, DiaryLine, Input, Row, Screen, T } from '../components/ui';
import { get, post } from '../lib/api';
import { db, useDb } from '../lib/db';
import { notice } from '../lib/hooks';
import { useName, useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { toPaise, useSave } from '../lib/setup';

type Line = { id: string; materialId: string; qty: number; rate: string };

// An approved material request becomes an order: confirm the quantities, choose the supplier (or add one),
// a rate if known — and the order goes to the supplier's WhatsApp in one tap, as a message he can read.
export default function Order() {
  const t = useT();
  const name = useName();
  const { me } = useSession();
  const { indent: indentId } = useLocalSearchParams<{ indent: string }>();
  const { busy, run } = useSave();
  const indent = useDb(() => db.find('indent', indentId));
  const initial = useDb(() => db.rows('indentLine').filter((l) => l.indentId === indentId));
  const [lines, setLines] = useState<Line[] | null>(null);
  const shown: Line[] = lines ?? initial.map((l) => ({ id: l.id, materialId: String(l.materialId), qty: Number(l.qty), rate: '' }));
  // The supplier who brought these materials before comes first.
  const suppliers = useDb(() => byUse(db.rows('supplier'), db.rows('grnLine').filter((l) => shown.some((x) => x.materialId === l.materialId)).map((l) => db.find('grn', l.grnId as string)?.supplierId)));
  const [supplierId, setSupplier] = useState<string | null>(null);
  const supplier = useDb(() => (supplierId ? db.find('supplier', supplierId) : undefined));
  const site = me?.projects.find((p) => p.id === indent?.projectId);
  const neededBy = String(indent?.neededBy ?? isoDate());
  const material = (id: string) => db.find('material', id);
  const items = useMemo(() => shown.filter((l) => l.qty > 0).map((l) => `${name(material(l.materialId))} ${formatNumber(l.qty)} ${String(material(l.materialId)?.unit ?? '')}`), [shown, name]);
  const set = (id: string, patch: Partial<Line>) => setLines(shown.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const send = () => void run(async () => {
    const po = await post<{ id: string; poNo: string; status: string }>('/purchase/pos', {
      projectId: indent?.projectId, supplierId, indentId,
      lines: shown.filter((l) => l.qty > 0).map((l) => ({ materialId: l.materialId, qty: l.qty, ratePaise: toPaise(l.rate) })),
    });
    if (po.status === 'pending_approval') {
      notice(t('order.waitsOwner'));
      router.back();
      return;
    }
    const share = await get<{ link: string }>(`/purchase/pos/${po.id}/share`).catch(() => ({ link: '' }));
    await post(`/purchase/pos/${po.id}/status`, { status: 'sent' }).catch(() => undefined);
    const text = t('order.message', { supplier: String(supplier?.name ?? ''), company: me?.company.name ?? '', poNo: po.poNo, items: items.map((i) => `• ${i}`).join('\n'), site: site?.name ?? '', date: shortDate(neededBy), link: share.link });
    const phone = String(supplier?.phone ?? '').replace(/\D/g, '').slice(-10);
    await Linking.openURL(`https://wa.me/${phone ? `91${phone}` : ''}?text=${encodeURIComponent(text)}`);
    router.back();
  });

  if (!indent) return <Screen title={t('order.title')}><Banner tone="error" text={t('common.error')} /></Screen>;
  return (
    <Screen
      title={t('order.title')}
      subtitle={site?.name}
      footer={
        <>
          {supplier && items.length ? <DiaryLine text={t('order.line', { supplier: String(supplier.name), items: items.join(', '), date: shortDate(neededBy) })} /> : null}
          <Button kind="success" icon="whatsapp" label={t('order.send')} busy={busy} disabled={!supplierId || !items.length} onPress={send} />
        </>
      }
    >
      <Ask q={t('order.qItems')} hint={t('order.rateHint')}>
        {shown.map((l) => {
          const unit = String(material(l.materialId)?.unit ?? '');
          return (
            <Card key={l.id} style={{ gap: spacing.sm }}>
              <T.body bold>{name(material(l.materialId))}</T.body>
              <QtyField label="" unit={unit} value={l.qty} onChange={(qty) => set(l.id, { qty })} />
              <Row>
                <View style={{ flex: 1 }}><T.small>{t('order.rate', { unit })}</T.small></View>
                <Input value={l.rate} onChangeText={(v) => set(l.id, { rate: v.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad" placeholder="—" accessibilityLabel={t('order.rate', { unit })} style={{ width: 120, textAlign: 'right', fontSize: 18, fontWeight: '700' }} />
              </Row>
            </Card>
          );
        })}
      </Ask>
      <Ask q={t('order.qSupplier')}>
        <RowChips label="" rows={suppliers} max={8} value={supplierId} onChange={setSupplier} nameOf={(r) => String(r.name)} />
        <QuickAdd label={t('grn.newSupplier')} placeholder="Umiya Cement Traders" onAdd={async (n) => {
          const s = await post<{ id: string }>('/masters/supplier', { name: n });
          await db.sync();
          setSupplier(s.id);
        }} />
        {supplier && !supplier.phone ? <T.small color={colors.warning}>{t('order.noPhone')}</T.small> : null}
      </Ask>
    </Screen>
  );
}
