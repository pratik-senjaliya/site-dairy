import { acceptedQty, addDays, isLowStock, isoDate, roundQty, stockDaysLeft, stockDelta } from '@site-diary/shared';
import { db } from './db';

/** Days of stock left at which a material counts as running out. */
export const SOON = 3;

/**
 * A site's stock = office figure at the last sync ± entries on this phone not yet sent,
 * with how long each material lasts at the last week's rate of use. Call inside useDb.
 */
export function siteStock(siteId: string | null) {
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
  });
}

/**
 * Material asked for (approved or ordered) that has not all come yet: each request line less what this site
 * received of that material since the request. Oldest need first. Call inside useDb.
 */
export function awaitedMaterial(siteId: string | null) {
  const since = addDays(isoDate(), -30);
  const received = (materialId: unknown, from: string) =>
    db.rows('grnLine').filter((l) => l.materialId === materialId).reduce((sum, l) => {
      const g = db.find('grn', l.grnId as string);
      return g && g.projectId === siteId && String(g.date) >= from ? sum + acceptedQty(Number(l.qty), Number(l.rejectedQty ?? 0)) : sum;
    }, 0);
  return db.rows('indent')
    .filter((i) => i.projectId === siteId && (i.status === 'approved' || i.status === 'ordered') && isoDate(new Date(String(i.createdAt ?? Date.now()))) >= since)
    .flatMap((i) => {
      const from = isoDate(new Date(String(i.createdAt ?? Date.now())));
      const neededBy = String(i.neededBy ?? from);
      return db.rows('indentLine').filter((l) => l.indentId === i.id).map((l) => ({
        indentId: i.id, materialId: String(l.materialId), qty: roundQty(Number(l.qty) - received(l.materialId, from)), neededBy, late: neededBy < isoDate(), ordered: i.status === 'ordered',
      }));
    })
    .filter((x) => x.qty > 0)
    .sort((a, b) => a.neededBy.localeCompare(b.neededBy));
}
