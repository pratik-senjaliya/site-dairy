import { addDays, isLowStock, isoDate, parseSettings, roundQty, settlePeriod } from '@site-diary/shared';
import type { Notice } from '@site-diary/i18n';
import { isoOf } from '../../lib/json';
import { day } from '../../lib/json';
import { prisma } from '../../lib/prisma';
import { stockFor } from '../store/ledger';

const workers = (e: { count: number; halfDayCount: number }) => e.count + e.halfDayCount;
const manDays = (e: { count: number; halfDayCount: number }) => e.count + e.halfDayCount / 2;

export interface SiteDaySummary {
  project: { id: string; name: string };
  date: string;
  marker: string;
  note: string | null;
  labour: {
    workers: number;
    manDays: number;
    /** Today's wages at the rates in force (attendance × rate + overtime); `costMissingRates` when some skill has no rate. */
    costPaise: number;
    costMissingRates: boolean;
    yesterday: number;
    avg7: number;
    changePct: number | null;
    byContractor: { contractor: string; workers: number; skills: { skill: string; skillGu: string; count: number; halfDay: number; otHours: number }[] }[];
  };
  materialIn: { material: string; materialGu: string; unit: string; qty: number; rejected: number; supplier: string | null; challanNo: string | null }[];
  materialUsed: { material: string; materialGu: string; unit: string; qty: number; workItem: string | null; floor: string | null }[];
  progress: { workItem: string; workItemGu: string; floor: string | null; percent: number; note: string | null }[];
  photos: { id: string; sourceType: string; uploaded: boolean }[];
  issuesOpened: { title: string; status: string }[];
  openIssues: number;
  lowStock: { material: string; materialGu: string; unit: string; qty: number; min: number }[];
  missing: string[];
  alerts: Notice[];
}

/** One site's day: the source for the dashboard, the site detail screen and the nightly report. */
export async function siteDaySummary(companyId: string, projectId: string, date = isoDate()): Promise<SiteDaySummary> {
  const d = day(date);
  const weekFrom = day(addDays(date, -7));
  const [project, company, siteDay, attendance, week, grns, issues, progress, photos, opened, openIssues, settings, stock] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
    prisma.siteDay.findFirst({ where: { projectId, date: d, deletedAt: null } }),
    prisma.attendanceEntry.findMany({ where: { projectId, date: d, deletedAt: null } }),
    prisma.attendanceEntry.findMany({ where: { projectId, date: { gte: weekFrom, lt: d }, deletedAt: null } }),
    prisma.grn.findMany({ where: { projectId, date: d, deletedAt: null }, include: { lines: { where: { deletedAt: null } } } }),
    prisma.materialIssue.findMany({ where: { projectId, date: d, deletedAt: null } }),
    prisma.dailyProgress.findMany({ where: { projectId, date: d, deletedAt: null } }),
    prisma.photo.findMany({ where: { projectId, deletedAt: null, takenAt: { gte: new Date(`${date}T00:00:00+05:30`), lt: new Date(`${addDays(date, 1)}T00:00:00+05:30`) } }, select: { id: true, sourceType: true, uploaded: true } }),
    prisma.issue.findMany({ where: { projectId, deletedAt: null, createdAt: { gte: new Date(`${date}T00:00:00+05:30`), lt: new Date(`${addDays(date, 1)}T00:00:00+05:30`) } } }),
    prisma.issue.count({ where: { projectId, deletedAt: null, status: 'open' } }),
    prisma.siteMaterialSetting.findMany({ where: { projectId, deletedAt: null } }),
    stockFor(null, companyId, [projectId]),
  ]);
  const [contractors, skills, materials, suppliers, workItems, nodes] = await Promise.all([
    prisma.contractor.findMany({ where: { companyId } }),
    prisma.skill.findMany({ where: { companyId } }),
    prisma.material.findMany({ where: { companyId } }),
    prisma.supplier.findMany({ where: { companyId } }),
    prisma.workItem.findMany({ where: { projectId } }),
    prisma.structureNode.findMany({ where: { projectId } }),
  ]);
  const rates = await prisma.contractorRate.findMany({ where: { contractorId: { in: [...new Set(attendance.map((e) => e.contractorId))] }, deletedAt: null } });
  const cost = contractors
    .map((c) => settlePeriod(
      attendance.filter((e) => e.contractorId === c.id).map((e) => ({ date, skillId: e.skillId, count: e.count, halfDayCount: e.halfDayCount, otHours: e.otHours.toNumber() })),
      rates.filter((r) => r.contractorId === c.id).map((r) => ({ skillId: r.skillId, dailyRatePaise: Number(r.dailyRatePaise), effectiveFrom: isoOf(r.effectiveFrom) })),
      0,
    ))
    .reduce((acc, r) => ({ gross: acc.gross + r.gross, missing: acc.missing || r.missingRates.length > 0 }), { gross: 0, missing: false });
  const mat = (id: string) => materials.find((m) => m.id === id);
  const nodeName = (id: string | null) => {
    const n = nodes.find((x) => x.id === id);
    if (!n) return null;
    const parent = nodes.find((x) => x.id === n.parentId);
    return parent ? `${parent.name} · ${n.name}` : n.name;
  };

  const todayWorkers = attendance.reduce((s, e) => s + workers(e), 0);
  const perDay = new Map<string, number>();
  for (const e of week) perDay.set(e.date.toISOString(), (perDay.get(e.date.toISOString()) ?? 0) + workers(e));
  const yesterday = perDay.get(day(addDays(date, -1)).toISOString()) ?? 0;
  const avg7 = perDay.size ? Math.round([...perDay.values()].reduce((a, b) => a + b, 0) / perDay.size) : 0;
  const changePct = avg7 && attendance.length ? Math.round(((todayWorkers - avg7) / avg7) * 100) : null; // nothing entered yet is not a 100% drop

  const byContractor = contractors
    .map((c) => {
      const rows = attendance.filter((e) => e.contractorId === c.id);
      return {
        contractor: c.name,
        workers: rows.reduce((s, e) => s + workers(e), 0),
        skills: rows.map((e) => {
          const s = skills.find((k) => k.id === e.skillId);
          return { skill: s?.nameEn ?? '', skillGu: s?.nameGu ?? '', count: e.count, halfDay: e.halfDayCount, otHours: e.otHours.toNumber() };
        }),
      };
    })
    .filter((c) => c.workers > 0);

  const lowStock = settings
    .map((s) => {
      const m = mat(s.materialId);
      const qty = stock.find((x) => x.materialId === s.materialId)?.qty ?? 0;
      return { material: m?.nameEn ?? '', materialGu: m?.nameGu ?? '', unit: m?.unit ?? '', qty, min: s.minStock.toNumber() };
    })
    .filter((r) => isLowStock(r.qty, r.min));

  const marker = siteDay?.marker ?? 'work';
  const missing: string[] = [];
  if (marker === 'work') {
    if (!attendance.length) missing.push('attendance');
    if (!progress.length) missing.push('progress');
  }
  const cfg = parseSettings(company.settings);
  const alerts: Notice[] = [];
  if (changePct !== null && Math.abs(changePct) >= cfg.labourAlertPercent && attendance.length) {
    alerts.push({ key: changePct > 0 ? 'alert.labourUp' : 'alert.labourDown', vars: { pct: Math.abs(changePct), avg: avg7 } });
  }
  for (const l of lowStock) alerts.push({ key: 'alert.lowStock', vars: { material: l.material, qty: l.qty, unit: l.unit, min: l.min }, gu: { material: l.materialGu } });
  const rejected = grns.flatMap((g) => g.lines).filter((l) => l.rejectedQty.toNumber() > 0);
  for (const l of rejected) alerts.push({ key: 'alert.rejected', vars: { material: mat(l.materialId)?.nameEn ?? '', qty: l.rejectedQty.toNumber() }, gu: { material: mat(l.materialId)?.nameGu ?? '' } });

  return {
    project: { id: project.id, name: project.name },
    date,
    marker,
    note: siteDay?.note ?? null,
    labour: { workers: todayWorkers, manDays: attendance.reduce((s, e) => s + manDays(e), 0), costPaise: cost.gross, costMissingRates: cost.missing, yesterday, avg7, changePct, byContractor },
    materialIn: grns.flatMap((g) =>
      g.lines.map((l) => {
        const m = mat(l.materialId);
        return {
          material: m?.nameEn ?? '', materialGu: m?.nameGu ?? '', unit: m?.unit ?? '', qty: roundQty(l.qty.toNumber()), rejected: roundQty(l.rejectedQty.toNumber()),
          supplier: suppliers.find((s) => s.id === g.supplierId)?.name ?? null, challanNo: g.challanNo,
        };
      }),
    ),
    materialUsed: issues.map((i) => {
      const m = mat(i.materialId);
      return { material: m?.nameEn ?? '', materialGu: m?.nameGu ?? '', unit: m?.unit ?? '', qty: roundQty(i.qty.toNumber()), workItem: workItems.find((w) => w.id === i.workItemId)?.nameEn ?? null, floor: nodeName(i.structureNodeId) };
    }),
    progress: progress.map((p) => {
      const w = workItems.find((x) => x.id === p.workItemId);
      return { workItem: w?.nameEn ?? '', workItemGu: w?.nameGu ?? '', floor: nodeName(p.structureNodeId), percent: p.percent, note: p.note };
    }),
    photos,
    issuesOpened: opened.map((i) => ({ title: i.title, status: i.status })),
    openIssues,
    lowStock,
    missing,
    alerts,
  };
}
