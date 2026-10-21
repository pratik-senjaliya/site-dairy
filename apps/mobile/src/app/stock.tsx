import { acceptedQty, addDays, formatNumber, isLowStock, isoDate, roundQty, stockDaysLeft, stockDelta } from '@site-diary/shared';
import { colors } from '@site-diary/ui-tokens';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Banner, Button, Card, Row, Screen, T } from '../components/ui';
import { db, useDb } from '../lib/db';
import { useCan, useSite } from '../lib/hooks';
import { useName, useT } from '../lib/i18n';

const SOON = 3;

// M11: stock at this site = office figure at the last sync ± entries on this phone not yet sent,
// with how long each material lasts at the last week's rate of use.
export default function Stock() {
  const t = useT();
  const can = useCan();
  const name = useName();
  const { siteId } = useSite();
  const rows = useDb(() => {
    const local = new Map<string, number>();
    const add = (projectId: unknown, materialId: unknown, d: number) => {
      if (projectId !== siteId) return;
      local.set(String(materialId), (local.get(String(materialId)) ?? 0) + d);
    };
    for (const { table, row } of db.outboxRows()) {
      if (row.deletedAt) continue;
      if (table === 'grnLine') {
        const grn = db.find('grn', row.grnId as string);
        if (grn) add(grn.projectId, row.materialId, stockDelta('grn', acceptedQty(Number(row.qty), Number(row.rejectedQty ?? 0))));
      }
      if (table === 'materialIssue') add(row.projectId, row.materialId, stockDelta('issue', Number(row.qty)));
      if (table === 'stockTransfer' && row.status === 'sent') add(row.fromProjectId, row.materialId, stockDelta('transfer_out', Number(row.qty)));
    }
    const settings = db.rows('siteMaterialSetting').filter((s) => s.projectId === siteId);
    // Last 7 days' use, spread over the days the site worked (attendance entered).
    const since = addDays(isoDate(), -7);
    const used = new Map<string, number>();
    for (const i of db.rows('materialIssue')) if (i.projectId === siteId && String(i.date) > since) used.set(String(i.materialId), (used.get(String(i.materialId)) ?? 0) + Number(i.qty));
    const workDays = new Set(db.rows('attendanceEntry').filter((a) => a.projectId === siteId && String(a.date) > since).map((a) => a.date)).size;
    const ids = new Set([...db.stock.filter((s) => s.projectId === siteId).map((s) => s.materialId), ...local.keys(), ...settings.map((s) => String(s.materialId))]);
    return [...ids].map((materialId) => {
      const server = db.stock.find((s) => s.projectId === siteId && s.materialId === materialId)?.qty ?? 0;
      const pending = local.get(materialId) ?? 0;
      const min = settings.find((s) => s.materialId === materialId)?.minStock;
      const qty = roundQty(server + pending);
      const left = stockDaysLeft(qty, used.get(materialId) ?? 0, workDays);
      return { materialId, material: db.find('material', materialId), qty, pending: roundQty(pending), min: min == null ? null : Number(min), low: isLowStock(qty, min == null ? null : Number(min)), left, soon: !!left && left.days <= SOON };
    }).sort((a, b) => Number(b.soon || b.low) - Number(a.soon || a.low) || (a.left?.days ?? 1e9) - (b.left?.days ?? 1e9) || name(a.material).localeCompare(name(b.material)));
  });
  const lastSync = useDb(() => db.lastSync);

  return (
    <Screen title={t('home.stock')} scroll={false}>
      <T.small>{lastSync ? t('stock.asOf', { time: new Date(lastSync).toLocaleString('en-IN', { timeStyle: 'short', dateStyle: 'medium' }) }) : t('home.firstSync')}</T.small>
      {rows.some((r) => r.low) ? <Banner text={t('home.lowCount', { count: rows.filter((r) => r.low).length })} /> : null}
      {rows.some((r) => r.soon) ? <Banner text={t('stock.runningOut', { count: rows.filter((r) => r.soon).length })} /> : null}
      <FlashList
        data={rows}
        keyExtractor={(r) => r.materialId}
        ItemSeparatorComponent={() => <Row style={{ height: 8 }}>{null}</Row>}
        renderItem={({ item: r }) => (
          <Card style={r.low || r.soon ? { borderColor: colors.warning, borderWidth: 2 } : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T.body bold>{name(r.material)}</T.body>
              <T.h2>{formatNumber(r.qty)} {String(r.material?.unit ?? '')}</T.h2>
            </Row>
            {r.left ? (
              <T.small color={r.soon ? colors.warning : undefined}>
                {t(r.left.days ? 'stock.daysLeft' : 'stock.outToday', { days: r.left.days, perDay: formatNumber(r.left.perDay), unit: String(r.material?.unit ?? '') })}
              </T.small>
            ) : null}
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T.small color={r.low ? colors.warning : undefined}>
                  {r.min !== null ? t('stock.min', { qty: formatNumber(r.min) }) : ''}{r.pending ? ` · ${t('stock.unsent', { qty: formatNumber(r.pending) })}` : ''}
                </T.small>
              </View>
              {(r.soon || r.low) && can('indent', 'C') ? (
                <Button kind="secondary" small label={t('stock.request')} onPress={() => router.push({ pathname: '/indent', params: { material: r.materialId, qty: String(Math.ceil((r.left?.perDay ?? 0) * 7) || '') } })} />
              ) : null}
            </Row>
          </Card>
        )}
      />
    </Screen>
  );
}
