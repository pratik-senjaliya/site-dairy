import { acceptedQty, formatNumber, isLowStock, roundQty, stockDelta } from '@site-diary/shared';
import { colors } from '@site-diary/ui-tokens';
import { FlashList } from '@shopify/flash-list';
import { Banner, Card, Row, Screen, T } from '../components/ui';
import { db, useDb } from '../lib/db';
import { useSite } from '../lib/hooks';
import { useName, useT } from '../lib/i18n';

// M11: stock at this site = office figure at the last sync ± entries on this phone not yet sent.
export default function Stock() {
  const t = useT();
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
    const ids = new Set([...db.stock.filter((s) => s.projectId === siteId).map((s) => s.materialId), ...local.keys(), ...settings.map((s) => String(s.materialId))]);
    return [...ids].map((materialId) => {
      const server = db.stock.find((s) => s.projectId === siteId && s.materialId === materialId)?.qty ?? 0;
      const pending = local.get(materialId) ?? 0;
      const min = settings.find((s) => s.materialId === materialId)?.minStock;
      const qty = roundQty(server + pending);
      return { materialId, material: db.find('material', materialId), qty, pending: roundQty(pending), min: min == null ? null : Number(min), low: isLowStock(qty, min == null ? null : Number(min)) };
    }).sort((a, b) => Number(b.low) - Number(a.low) || name(a.material).localeCompare(name(b.material)));
  });
  const lastSync = useDb(() => db.lastSync);

  return (
    <Screen title={t('home.stock')} scroll={false}>
      <T.small>{lastSync ? t('stock.asOf', { time: new Date(lastSync).toLocaleString('en-IN', { timeStyle: 'short', dateStyle: 'medium' }) }) : t('home.firstSync')}</T.small>
      {rows.some((r) => r.low) ? <Banner text={t('home.lowCount', { count: rows.filter((r) => r.low).length })} /> : null}
      <FlashList
        data={rows}
        keyExtractor={(r) => r.materialId}
        ItemSeparatorComponent={() => <Row style={{ height: 8 }}>{null}</Row>}
        renderItem={({ item: r }) => (
          <Card style={r.low ? { borderColor: colors.warning, borderWidth: 2 } : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T.body bold>{name(r.material)}</T.body>
              <T.h2>{formatNumber(r.qty)} {String(r.material?.unit ?? '')}</T.h2>
            </Row>
            <T.small color={r.low ? colors.warning : undefined}>
              {r.min !== null ? t('stock.min', { qty: formatNumber(r.min) }) : ''}{r.pending ? ` · ${t('stock.unsent', { qty: formatNumber(r.pending) })}` : ''}
            </T.small>
          </Card>
        )}
      />
    </Screen>
  );
}
