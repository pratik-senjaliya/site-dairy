import { formatNumber, formatPaise, isoDate, shortDate } from '@site-diary/shared';
import { db, useDb, type Row } from './db';
import { useName, useT } from './i18n';
import { floorName } from './structure';

type R = Record<string, unknown>;
const BY = { cash: 'advance.byCash', upi: 'advance.byUpi', bank: 'advance.byBank' } as const;

/**
 * Every entry as one diary sentence, the same on its own screen (above Save, in "entered today")
 * and on the home's page for the day.
 */
export function useDiary() {
  const t = useT();
  const name = useName();
  const material = (materialId: unknown, qty: unknown) => {
    const m = db.find('material', materialId as string);
    return `${name(m)} ${formatNumber(Number(qty))} ${String(m?.unit ?? '')}`;
  };
  const floor = (id: unknown) => {
    const n = id ? db.find('structureNode', id as string) : undefined;
    return n ? floorName(n) : '';
  };
  const contractor = (id: unknown) => String(db.find('contractor', id as string)?.name ?? '');

  const d = {
    material,
    used: (r: R) => {
      const item = r.workItemId ? name(db.find('workItem', r.workItemId as string)) : '';
      const f = floor(r.structureNodeId);
      const where = item && f ? t('used.whereBoth', { item, floor: f }) : item ? t('used.whereItem', { item }) : f ? t('used.whereFloor', { floor: f }) : '';
      const m = db.find('material', r.materialId as string);
      return t('used.line', { material: name(m), qty: formatNumber(Number(r.qty)), unit: String(m?.unit ?? ''), where });
    },
    grnItem: (l: R) => {
      const item = material(l.materialId, l.qty);
      return Number(l.rejectedQty) ? t('grn.itemBad', { item, bad: formatNumber(Number(l.rejectedQty)) }) : item;
    },
    grn: (supplier: string | undefined, items: string) => (supplier ? t('grn.line', { supplier, items }) : t('grn.lineNoSupplier', { items })),
    grnRow: (g: R) => d.grn(db.find('supplier', g.supplierId as string)?.name as string | undefined, db.rows('grnLine').filter((l) => l.grnId === g.id).map(d.grnItem).join(', ') || '—'),
    progress: (r: R) => {
      const item = name(db.find('workItem', r.workItemId as string));
      const f = floor(r.structureNodeId);
      return f ? t('progress.lineFloor', { item, floor: f, percent: Number(r.percent) }) : t('progress.line', { item, percent: Number(r.percent) });
    },
    advance: (r: R) => {
      const c = contractor(r.contractorId);
      const w = r.workerId ? String(db.find('worker', r.workerId as string)?.name ?? '') : '';
      return t('advance.line', { who: w ? `${w} (${c.split(' (')[0]})` : c, amount: formatPaise(Number(r.amountPaise)), mode: t(BY[(r.mode as keyof typeof BY) ?? 'cash']) });
    },
    attendance: (rows: R[]) => {
      const by = new Map<string, number>();
      for (const a of rows) by.set(String(a.contractorId), (by.get(String(a.contractorId)) ?? 0) + Number(a.count) + Number(a.halfDayCount));
      const total = [...by.values()].reduce((x, n) => x + n, 0);
      return t('attendance.line', { total, list: [...by].filter(([, n]) => n).map(([id, n]) => `${contractor(id).split(' (')[0]} ${n}`).join(', ') });
    },
    indent: (items: string, neededIn: number) =>
      t('indent.line', { items, when: neededIn <= 0 ? t('indent.whenToday') : neededIn === 1 ? t('indent.whenTomorrow') : t('indent.whenIn', { count: neededIn }) }),
  };
  return d;
}

export type DiaryKind = 'day' | 'attendance' | 'grn' | 'used' | 'progress' | 'advance' | 'indent' | 'issue';

/** A site's day as diary lines, in the order the day is usually written. */
export function useDayPage(siteId: string | null, date = isoDate()): { kind: DiaryKind; text: string }[] {
  const t = useT();
  const d = useDiary();
  return useDb(() => dayPage(t, d, siteId, date));
}

function dayPage(t: ReturnType<typeof useT>, d: ReturnType<typeof useDiary>, siteId: string | null, date: string) {
  const mine = (rows: Row[]) => rows.filter((r) => r.projectId === siteId);
  const out: { kind: DiaryKind; text: string }[] = [];
  const day = mine(db.rows('siteDay')).find((r) => r.date === date);
  if (day && day.marker !== 'work') out.push({ kind: 'day', text: `${t('progress.dayLine', { marker: t(`marker.${String(day.marker)}` as 'marker.work') })}${day.note ? ` — ${String(day.note)}` : ''}` });
  const att = mine(db.rows('attendanceEntry')).filter((r) => r.date === date);
  if (att.length) out.push({ kind: 'attendance', text: d.attendance(att) });
  for (const g of mine(db.rows('grn')).filter((r) => r.date === date)) out.push({ kind: 'grn', text: d.grnRow(g) });
  for (const r of mine(db.rows('materialIssue')).filter((x) => x.date === date)) out.push({ kind: 'used', text: d.used(r) });
  for (const r of mine(db.rows('dailyProgress')).filter((x) => x.date === date)) out.push({ kind: 'progress', text: d.progress(r) });
  for (const r of mine(db.rows('advance')).filter((x) => x.date === date)) out.push({ kind: 'advance', text: d.advance(r) });
  for (const i of mine(db.rows('indent')).filter((x) => isoDate(new Date(String(x.createdAt ?? new Date().toISOString()))) === date)) {
    const items = db.rows('indentLine').filter((l) => l.indentId === i.id).map((l) => d.material(l.materialId, l.qty)).join(', ');
    if (items) out.push({ kind: 'indent', text: t('indent.line', { items, when: shortDate(String(i.neededBy ?? date)) }) });
  }
  for (const i of mine(db.rows('issue')).filter((x) => isoDate(new Date(String(x.createdAt ?? new Date().toISOString()))) === date)) out.push({ kind: 'issue', text: t('issues.line', { title: String(i.title) }) });
  return out;
}

/** Whole days since a row was made (problems: how long open). */
export const daysSince = (createdAt: unknown) =>
  Math.max(0, Math.round((Date.parse(isoDate()) - Date.parse(isoDate(new Date(String(createdAt ?? Date.now()))))) / 86_400_000));
