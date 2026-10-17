import { Prisma } from '@prisma/client';
import { acceptedQty, isLowStock, isoDate, roundQty, stockDelta, type StockRow } from '@site-diary/shared';
import type { Tx } from '../../lib/db';
import { notify, recipients } from '../../lib/notify';
import { transaction } from '../../lib/prisma';

type Pair = [projectId: string, materialId: string];

// stock_ledger is derived: each GRN, issue or transfer owns its rows, rebuilt whenever the source changes.
export async function rebuildLedger(tx: Tx, companyId: string, source: 'grn' | 'issue' | 'transfer', id: string): Promise<Pair[]> {
  const before = await tx.stockLedger.findMany({ where: { sourceId: id }, select: { projectId: true, materialId: true } });
  await tx.stockLedger.deleteMany({ where: { sourceId: id } });
  const rows: Prisma.StockLedgerCreateManyInput[] = [];

  if (source === 'grn') {
    const grn = await tx.grn.findUnique({ where: { id }, include: { lines: { where: { deletedAt: null } } } });
    if (grn && !grn.deletedAt) {
      for (const l of grn.lines) {
        const qty = acceptedQty(l.qty.toNumber(), l.rejectedQty.toNumber());
        if (qty > 0) rows.push({ companyId, projectId: grn.projectId, materialId: l.materialId, qtyDelta: stockDelta('grn', qty), sourceType: 'grn', sourceId: grn.id, date: grn.date });
      }
    }
  } else if (source === 'issue') {
    const issue = await tx.materialIssue.findUnique({ where: { id } });
    if (issue && !issue.deletedAt) {
      rows.push({ companyId, projectId: issue.projectId, materialId: issue.materialId, qtyDelta: stockDelta('issue', issue.qty.toNumber()), sourceType: 'issue', sourceId: id, date: issue.date });
    }
  } else {
    const t = await tx.stockTransfer.findUnique({ where: { id } });
    if (t && !t.deletedAt && t.status !== 'cancelled') {
      const date = new Date(`${isoDate(t.createdAt)}T00:00:00Z`);
      rows.push({ companyId, projectId: t.fromProjectId, materialId: t.materialId, qtyDelta: stockDelta('transfer_out', t.qty.toNumber()), sourceType: 'transfer_out', sourceId: id, date });
      if (t.status === 'received') {
        const at = new Date(`${isoDate(t.receivedAt ?? new Date())}T00:00:00Z`);
        rows.push({ companyId, projectId: t.toProjectId, materialId: t.materialId, qtyDelta: stockDelta('transfer_in', t.qty.toNumber()), sourceType: 'transfer_in', sourceId: id, date: at });
      }
    }
  }
  if (rows.length) await tx.stockLedger.createMany({ data: rows });
  return [...before, ...rows].map((r) => [r.projectId, r.materialId]);
}

export async function stockFor(db: Tx | null, companyId: string, projectIds: string[] | 'all', materialId?: string): Promise<StockRow[]> {
  const run = (d: Tx) =>
    d.stockLedger.groupBy({
      by: ['projectId', 'materialId'],
      where: { companyId, ...(projectIds !== 'all' && { projectId: { in: projectIds } }), ...(materialId && { materialId }) },
      _sum: { qtyDelta: true },
    });
  const groups = await (db ? run(db) : transaction(run));
  return groups.map((g) => ({ projectId: g.projectId, materialId: g.materialId, qty: roundQty(g._sum.qtyDelta?.toNumber() ?? 0) }));
}

/** One low-stock notice per site × material per day, to store, engineer and owner. */
export async function checkLowStock(tx: Tx, companyId: string, pairs: Pair[]) {
  const seen = new Set<string>();
  const today = isoDate();
  for (const [projectId, materialId] of pairs) {
    const key = `${projectId}:${materialId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const setting = await tx.siteMaterialSetting.findUnique({ where: { projectId_materialId: { projectId, materialId } } });
    if (!setting || setting.deletedAt) continue;
    const [row] = await stockFor(tx, companyId, [projectId], materialId);
    const onHand = row?.qty ?? 0;
    if (!isLowStock(onHand, setting.minStock.toNumber())) continue;
    const [material, project] = await Promise.all([
      tx.material.findUnique({ where: { id: materialId } }),
      tx.project.findUnique({ where: { id: projectId } }),
    ]);
    await notify(tx, companyId, await recipients(tx, companyId, ['store', 'engineer', 'owner'], projectId), {
      kind: 'low_stock',
      title: { key: 'notify.lowStock', vars: { material: { gu: material?.nameGu ?? '', en: material?.nameEn ?? '' }, site: project?.name ?? '' } },
      body: { key: 'notify.lowStockBody', vars: { qty: onHand, unit: material?.unit ?? '', min: setting.minStock.toNumber() } },
      entityType: 'project',
      entityId: projectId,
      dedupeKey: `low:${key}:${today}`,
    });
  }
}
