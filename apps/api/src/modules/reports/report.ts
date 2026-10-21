import { formatPaise, isoDate, settlePeriod } from '@site-diary/shared';
import { noticeText, t, type Locale } from '@site-diary/i18n';
import { day, isoOf } from '../../lib/json';
import { prisma } from '../../lib/prisma';
import { supplierLedger } from '../purchase/routes';
import { stockFor } from '../store/ledger';
import { siteDaySummary, type SiteDaySummary } from './daily';

// Every report is one structure, rendered as JSON (screen), Excel and PDF, so the three never disagree.
export type Fmt = 'text' | 'int' | 'qty' | 'money' | 'date' | 'pct';
export interface Column { key: string; header: string; fmt?: Fmt; width?: number }
export interface Table { title: string; columns: Column[]; rows: Record<string, unknown>[]; totals?: string[] }
export interface Report {
  title: string;
  company: string;
  subtitle: string;
  generatedAt: string;
  highlights: { label: string; value: string }[];
  tables: Table[];
  /** Photos to print (nightly report). */
  photos?: { id: string; storageKey: string; caption: string }[];
}

export const REPORT_TYPES = ['daily', 'attendance', 'wages', 'grn', 'stock', 'consumption', 'supplier-ledger', 'monthly'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export interface ReportArgs {
  companyId: string;
  projectIds: string[];
  from: string;
  to: string;
  supplierId?: string;
  locale: Locale;
  /** Daily report: add the day's labour cost (contractor rates), for readers who may see wages. */
  withCost?: boolean;
}

const names = async (companyId: string) => {
  const [company, projects, contractors, skills, materials, suppliers] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
    prisma.project.findMany({ where: { companyId } }),
    prisma.contractor.findMany({ where: { companyId } }),
    prisma.skill.findMany({ where: { companyId } }),
    prisma.material.findMany({ where: { companyId } }),
    prisma.supplier.findMany({ where: { companyId } }),
  ]);
  const by = <T extends { id: string }>(list: T[]) => (id: string | null | undefined) => list.find((x) => x.id === id);
  return { company, project: by(projects), contractor: by(contractors), skill: by(skills), material: by(materials), supplier: by(suppliers) };
};

const period = (a: ReportArgs) => (a.from === a.to ? a.from : `${a.from} to ${a.to}`);
const range = (a: ReportArgs) => ({ gte: day(a.from), lte: day(a.to) });

/** The daily report for one or more sites; also the nightly report. */
export function dailyTables(s: SiteDaySummary, l: Locale, withCost = false): { highlights: Report['highlights']; tables: Table[] } {
  const name = (en: string, gu: string) => (l === 'en' ? en : gu || en);
  const tables: Table[] = [];
  if (s.marker !== 'work') tables.push({ title: t(l, `marker.${s.marker}` as 'marker.work'), columns: [{ key: 'note', header: t(l, 'report.note') }], rows: [{ note: s.note ?? '' }] });
  tables.push({
    title: `${t(l, 'report.labour')} — ${s.labour.workers} ${t(l, 'report.workers')}`,
    columns: [
      { key: 'contractor', header: t(l, 'report.contractor'), width: 2 },
      { key: 'skill', header: t(l, 'report.skill') },
      { key: 'count', header: t(l, 'report.workers'), fmt: 'int' },
      { key: 'halfDay', header: t(l, 'report.halfDay'), fmt: 'int' },
      { key: 'ot', header: t(l, 'report.ot'), fmt: 'qty' },
    ],
    rows: s.labour.byContractor.flatMap((c) => c.skills.map((k) => ({ contractor: c.contractor, skill: name(k.skill, k.skillGu), count: k.count, halfDay: k.halfDay, ot: k.otHours }))),
    totals: ['count', 'halfDay', 'ot'],
  });
  if (s.materialIn.length) {
    tables.push({
      title: t(l, 'report.materialIn'),
      columns: [
        { key: 'material', header: t(l, 'report.material'), width: 2 },
        { key: 'qty', header: t(l, 'report.qty'), fmt: 'qty' },
        { key: 'unit', header: '' },
        { key: 'rejected', header: t(l, 'report.rejected'), fmt: 'qty' },
        { key: 'supplier', header: t(l, 'report.supplier'), width: 2 },
        { key: 'challan', header: t(l, 'report.challan') },
      ],
      rows: s.materialIn.map((m) => ({ material: name(m.material, m.materialGu), qty: m.qty, unit: m.unit, rejected: m.rejected || null, supplier: m.supplier, challan: m.challanNo })),
    });
  }
  if (s.materialUsed.length) {
    tables.push({
      title: t(l, 'report.materialUsed'),
      columns: [
        { key: 'material', header: t(l, 'report.material'), width: 2 },
        { key: 'qty', header: t(l, 'report.qty'), fmt: 'qty' },
        { key: 'unit', header: '' },
        { key: 'workItem', header: t(l, 'report.workItem') },
        { key: 'floor', header: t(l, 'report.floor') },
      ],
      rows: s.materialUsed.map((m) => ({ material: name(m.material, m.materialGu), qty: m.qty, unit: m.unit, workItem: m.workItem, floor: m.floor })),
    });
  }
  if (s.progress.length) {
    tables.push({
      title: t(l, 'report.progress'),
      columns: [
        { key: 'workItem', header: t(l, 'report.workItem'), width: 2 },
        { key: 'floor', header: t(l, 'report.floor'), width: 2 },
        { key: 'percent', header: t(l, 'report.percent'), fmt: 'int' },
        { key: 'note', header: t(l, 'report.note'), width: 3 },
      ],
      rows: s.progress.map((p) => ({ workItem: name(p.workItem, p.workItemGu), floor: p.floor, percent: p.percent, note: p.note })),
    });
  }
  const notes = [
    ...s.alerts.map((a) => noticeText(l, a)),
    ...(s.missing.length ? [`${t(l, 'report.missing')}: ${s.missing.map((m) => t(l, `missing.${m}` as 'missing.attendance')).join(', ')}`] : []),
  ];
  if (notes.length) tables.unshift({ title: t(l, 'report.alerts'), columns: [{ key: 'alert', header: '' }], rows: notes.map((alert) => ({ alert })) });
  return {
    highlights: [
      { label: t(l, 'report.workers'), value: String(s.labour.workers) },
      ...(withCost && s.labour.costPaise ? [{ label: t(l, 'owner.labourCostDay'), value: formatPaise(s.labour.costPaise) }] : []),
      { label: t(l, 'report.yesterday'), value: String(s.labour.yesterday) },
      { label: t(l, 'report.avg7'), value: String(s.labour.avg7) },
      { label: t(l, 'report.photos'), value: String(s.photos.length) },
      { label: t(l, 'report.openIssues'), value: String(s.openIssues) },
    ],
    tables,
  };
}

export async function buildReport(type: ReportType, a: ReportArgs): Promise<Report> {
  const n = await names(a.companyId);
  const base = { company: n.company.name, generatedAt: new Date().toISOString() };
  const sitesLabel = a.projectIds.map((id) => n.project(id)?.name).join(', ');
  const where = { projectId: { in: a.projectIds }, deletedAt: null };

  switch (type) {
    case 'daily': {
      const summaries = await Promise.all(a.projectIds.map((id) => siteDaySummary(a.companyId, id, a.to)));
      const tables: Table[] = [];
      const photos: Report['photos'] = [];
      for (const s of summaries) {
        const d = dailyTables(s, a.locale);
        tables.push(...d.tables.map((tb) => ({ ...tb, title: summaries.length > 1 ? `${s.project.name} · ${tb.title}` : tb.title })));
        const ph = await prisma.photo.findMany({ where: { id: { in: s.photos.filter((p) => p.uploaded).map((p) => p.id) } }, take: 6, orderBy: { takenAt: 'desc' } });
        photos.push(...ph.map((p) => ({ id: p.id, storageKey: p.storageKey, caption: `${s.project.name} · ${p.sourceType}` })));
      }
      const total = summaries.reduce((x, s) => x + s.labour.workers, 0);
      const cost = summaries.reduce((x, s) => x + s.labour.costPaise, 0);
      return {
        ...base, title: t(a.locale, 'report.daily'), subtitle: `${sitesLabel} · ${a.to}`,
        highlights: summaries.length === 1 ? dailyTables(summaries[0]!, a.locale, a.withCost).highlights : [
          { label: t(a.locale, 'report.workers'), value: String(total) },
          ...(a.withCost && cost ? [{ label: t(a.locale, 'owner.labourCostDay'), value: formatPaise(cost) }] : []),
        ],
        tables, photos,
      };
    }
    case 'attendance': {
      const rows = await prisma.attendanceEntry.findMany({ where: { ...where, date: range(a) }, orderBy: [{ date: 'asc' }] });
      const byContractor = new Map<string, { days: number; manDays: number; ot: number }>();
      for (const r of rows) {
        const k = n.contractor(r.contractorId)?.name ?? '';
        const v = byContractor.get(k) ?? { days: 0, manDays: 0, ot: 0 };
        v.manDays += r.count + r.halfDayCount / 2;
        v.ot += r.otHours.toNumber();
        byContractor.set(k, v);
      }
      return {
        ...base, title: 'Attendance register', subtitle: `${sitesLabel} · ${period(a)}`,
        highlights: [{ label: 'Man-days', value: String(rows.reduce((s, r) => s + r.count + r.halfDayCount / 2, 0)) }],
        tables: [
          {
            title: 'By contractor',
            columns: [{ key: 'contractor', header: 'Contractor', width: 3 }, { key: 'manDays', header: 'Man-days', fmt: 'qty' }, { key: 'ot', header: 'OT hours', fmt: 'qty' }],
            rows: [...byContractor].map(([contractor, v]) => ({ contractor, manDays: v.manDays, ot: v.ot })),
            totals: ['manDays', 'ot'],
          },
          {
            title: 'Daily entries',
            columns: [
              { key: 'date', header: 'Date', fmt: 'date' }, { key: 'site', header: 'Site' }, { key: 'contractor', header: 'Contractor', width: 2 },
              { key: 'skill', header: 'Skill' }, { key: 'count', header: 'Full day', fmt: 'int' }, { key: 'half', header: 'Half day', fmt: 'int' }, { key: 'ot', header: 'OT hrs', fmt: 'qty' },
            ],
            rows: rows.map((r) => ({
              date: isoOf(r.date), site: n.project(r.projectId)?.name, contractor: n.contractor(r.contractorId)?.name, skill: n.skill(r.skillId)?.nameEn,
              count: r.count, half: r.halfDayCount, ot: r.otHours.toNumber(),
            })),
            totals: ['count', 'half', 'ot'],
          },
        ],
      };
    }
    case 'wages': {
      const [settlements, entries, rates, advances] = await Promise.all([
        prisma.wageSettlement.findMany({ where: { ...where, periodFrom: { lte: day(a.to) }, periodTo: { gte: day(a.from) } }, orderBy: { periodFrom: 'asc' } }),
        prisma.attendanceEntry.findMany({ where: { ...where, date: range(a) } }),
        prisma.contractorRate.findMany({ where: { companyId: a.companyId, deletedAt: null } }),
        prisma.advance.findMany({ where: { ...where, date: range(a) } }),
      ]);
      const contractorIds = [...new Set(entries.map((e) => e.contractorId))];
      const sheet = contractorIds.map((cid) => {
        const r = settlePeriod(
          entries.filter((e) => e.contractorId === cid).map((e) => ({ date: isoOf(e.date), skillId: e.skillId, count: e.count, halfDayCount: e.halfDayCount, otHours: e.otHours.toNumber() })),
          rates.filter((x) => x.contractorId === cid).map((x) => ({ skillId: x.skillId, dailyRatePaise: Number(x.dailyRatePaise), effectiveFrom: isoOf(x.effectiveFrom) })),
          advances.filter((x) => x.contractorId === cid).reduce((s, x) => s + Number(x.amountPaise), 0),
        );
        return { contractor: n.contractor(cid)?.name, manDays: r.manDays, gross: r.gross, advances: r.advances, net: r.net, note: r.missingRates.length ? 'Some skills have no rate' : '' };
      });
      return {
        ...base, title: 'Wage settlement sheet', subtitle: `${sitesLabel} · ${period(a)}`,
        highlights: [{ label: 'Payable', value: formatPaise(sheet.reduce((s, r) => s + r.net, 0)) }],
        tables: [
          {
            title: 'Worked out from attendance',
            columns: [
              { key: 'contractor', header: 'Contractor', width: 3 }, { key: 'manDays', header: 'Man-days', fmt: 'qty' }, { key: 'gross', header: 'Gross', fmt: 'money' },
              { key: 'advances', header: 'Advances (upad)', fmt: 'money' }, { key: 'net', header: 'Payable', fmt: 'money' }, { key: 'note', header: 'Note', width: 2 },
            ],
            rows: sheet,
            totals: ['manDays', 'gross', 'advances', 'net'],
          },
          {
            title: 'Settlements',
            columns: [
              { key: 'contractor', header: 'Contractor', width: 3 }, { key: 'from', header: 'From', fmt: 'date' }, { key: 'to', header: 'To', fmt: 'date' },
              { key: 'net', header: 'Net', fmt: 'money' }, { key: 'status', header: 'Status' }, { key: 'paidAt', header: 'Paid', fmt: 'date' },
            ],
            rows: settlements.map((s) => ({ contractor: n.contractor(s.contractorId)?.name, from: isoOf(s.periodFrom), to: isoOf(s.periodTo), net: Number(s.netPaise), status: s.status, paidAt: s.paidAt ? isoDate(s.paidAt) : null })),
            totals: ['net'],
          },
        ],
      };
    }
    case 'grn': {
      const grns = await prisma.grn.findMany({ where: { ...where, date: range(a) }, include: { lines: { where: { deletedAt: null } } }, orderBy: { date: 'asc' } });
      return {
        ...base, title: 'GRN register', subtitle: `${sitesLabel} · ${period(a)}`,
        highlights: [{ label: 'Receipts', value: String(grns.length) }],
        tables: [{
          title: 'Material received',
          columns: [
            { key: 'date', header: 'Date', fmt: 'date' }, { key: 'site', header: 'Site' }, { key: 'challan', header: 'Challan' }, { key: 'vehicle', header: 'Vehicle' },
            { key: 'supplier', header: 'Supplier', width: 2 }, { key: 'material', header: 'Material', width: 2 }, { key: 'qty', header: 'Qty', fmt: 'qty' },
            { key: 'rejected', header: 'Rejected', fmt: 'qty' }, { key: 'unit', header: 'Unit' }, { key: 'value', header: 'Value', fmt: 'money' },
          ],
          rows: grns.flatMap((g) => g.lines.map((l) => ({
            date: isoOf(g.date), site: n.project(g.projectId)?.name, challan: g.challanNo, vehicle: g.vehicleNo, supplier: n.supplier(g.supplierId)?.name,
            material: n.material(l.materialId)?.nameEn, qty: l.qty.toNumber(), rejected: l.rejectedQty.toNumber(), unit: n.material(l.materialId)?.unit,
            value: l.ratePaise == null ? null : Math.round((l.qty.toNumber() - l.rejectedQty.toNumber()) * Number(l.ratePaise)),
          }))),
          totals: ['value'],
        }],
      };
    }
    case 'stock': {
      const [stock, settings] = await Promise.all([
        stockFor(null, a.companyId, a.projectIds),
        prisma.siteMaterialSetting.findMany({ where: { projectId: { in: a.projectIds }, deletedAt: null } }),
      ]);
      return {
        ...base, title: 'Stock statement', subtitle: `${sitesLabel} · as on ${isoDate()}`, highlights: [],
        tables: [{
          title: 'Stock on hand',
          columns: [
            { key: 'site', header: 'Site' }, { key: 'material', header: 'Material', width: 2 }, { key: 'qty', header: 'On hand', fmt: 'qty' },
            { key: 'unit', header: 'Unit' }, { key: 'min', header: 'Minimum', fmt: 'qty' }, { key: 'low', header: '' },
          ],
          rows: stock.map((s) => {
            const min = settings.find((x) => x.projectId === s.projectId && x.materialId === s.materialId)?.minStock.toNumber() ?? null;
            return { site: n.project(s.projectId)?.name, material: n.material(s.materialId)?.nameEn, qty: s.qty, unit: n.material(s.materialId)?.unit, min, low: min != null && s.qty < min ? 'LOW' : '' };
          }),
        }],
      };
    }
    case 'consumption': {
      const issues = await prisma.materialIssue.findMany({ where: { ...where, date: range(a) } });
      const [workItems, nodes] = await Promise.all([
        prisma.workItem.findMany({ where: { projectId: { in: a.projectIds } } }),
        prisma.structureNode.findMany({ where: { projectId: { in: a.projectIds } } }),
      ]);
      const groups = new Map<string, { site: string; floor: string; workItem: string; material: string; unit: string; qty: number }>();
      for (const i of issues) {
        const node = nodes.find((x) => x.id === i.structureNodeId);
        const parent = nodes.find((x) => x.id === node?.parentId);
        const key = [i.projectId, i.structureNodeId, i.workItemId, i.materialId].join(':');
        const g = groups.get(key) ?? {
          site: n.project(i.projectId)?.name ?? '', floor: node ? `${parent ? `${parent.name} · ` : ''}${node.name}` : '-',
          workItem: workItems.find((w) => w.id === i.workItemId)?.nameEn ?? '-', material: n.material(i.materialId)?.nameEn ?? '', unit: n.material(i.materialId)?.unit ?? '', qty: 0,
        };
        g.qty += i.qty.toNumber();
        groups.set(key, g);
      }
      return {
        ...base, title: 'Consumption by floor and work item', subtitle: `${sitesLabel} · ${period(a)}`, highlights: [],
        tables: [{
          title: 'Material used',
          columns: [{ key: 'site', header: 'Site' }, { key: 'floor', header: 'Floor', width: 2 }, { key: 'workItem', header: 'Work item' }, { key: 'material', header: 'Material', width: 2 }, { key: 'qty', header: 'Qty', fmt: 'qty' }, { key: 'unit', header: 'Unit' }],
          rows: [...groups.values()].sort((x, y) => x.floor.localeCompare(y.floor)),
        }],
      };
    }
    case 'supplier-ledger': {
      const supplier = n.supplier(a.supplierId);
      if (!supplier) throw new Error('supplierId is required');
      const ledger = await supplierLedger(a.companyId, supplier.id);
      return {
        ...base, title: 'Supplier ledger', subtitle: supplier.name,
        highlights: [{ label: 'Due', value: formatPaise(ledger.duePaise) }],
        tables: [{
          title: supplier.name,
          columns: [
            { key: 'date', header: 'Date', fmt: 'date' }, { key: 'kind', header: 'Entry' }, { key: 'ref', header: 'Ref' }, { key: 'site', header: 'Site' },
            { key: 'debit', header: 'Material (Dr)', fmt: 'money' }, { key: 'credit', header: 'Paid (Cr)', fmt: 'money' }, { key: 'balance', header: 'Balance', fmt: 'money' },
          ],
          rows: ledger.rows.map((r) => ({
            date: isoOf(r.date), kind: r.kind === 'grn' ? `GRN${r.unpricedLines ? ` (${r.unpricedLines} unpriced)` : ''}` : 'Payment', ref: r.ref, site: n.project(r.projectId)?.name,
            debit: r.debitPaise || null, credit: r.creditPaise || null, balance: r.balancePaise,
          })),
          totals: ['debit', 'credit'],
        }],
      };
    }
    case 'monthly': {
      const [entries, rates, grns, settlements, payments, advances] = await Promise.all([
        prisma.attendanceEntry.findMany({ where: { ...where, date: range(a) } }),
        prisma.contractorRate.findMany({ where: { companyId: a.companyId, deletedAt: null } }),
        prisma.grn.findMany({ where: { ...where, date: range(a) }, include: { lines: { where: { deletedAt: null } } } }),
        prisma.wageSettlement.findMany({ where: { ...where, status: 'paid', paidAt: { gte: new Date(`${a.from}T00:00:00+05:30`), lt: new Date(new Date(`${a.to}T00:00:00+05:30`).getTime() + 86_400_000) } } }),
        prisma.supplierPayment.findMany({ where: { companyId: a.companyId, deletedAt: null, date: range(a), OR: [{ projectId: { in: a.projectIds } }, { projectId: null }] } }),
        prisma.advance.findMany({ where: { ...where, date: range(a) } }),
      ]);
      const rows = a.projectIds.map((pid) => {
        const labour = settlePeriod(
          entries.filter((e) => e.projectId === pid).map((e) => ({ date: isoOf(e.date), skillId: `${e.contractorId}:${e.skillId}`, count: e.count, halfDayCount: e.halfDayCount, otHours: e.otHours.toNumber() })),
          rates.map((r) => ({ skillId: `${r.contractorId}:${r.skillId}`, dailyRatePaise: Number(r.dailyRatePaise), effectiveFrom: isoOf(r.effectiveFrom) })),
          0,
        );
        const material = grns.filter((g) => g.projectId === pid).flatMap((g) => g.lines).reduce((s, l) => s + (l.ratePaise == null ? 0 : Math.round((l.qty.toNumber() - l.rejectedQty.toNumber()) * Number(l.ratePaise))), 0);
        return {
          site: n.project(pid)?.name, manDays: labour.manDays, labourCost: labour.gross, material,
          wagesPaid: settlements.filter((s) => s.projectId === pid).reduce((s, x) => s + Number(x.netPaise), 0),
          advances: advances.filter((x) => x.projectId === pid).reduce((s, x) => s + Number(x.amountPaise), 0),
          supplierPaid: payments.filter((p) => p.projectId === pid).reduce((s, p) => s + Number(p.amountPaise), 0),
        };
      });
      const unassigned = payments.filter((p) => !p.projectId).reduce((s, p) => s + Number(p.amountPaise), 0);
      return {
        ...base, title: 'Monthly site summary for the CA', subtitle: `${sitesLabel} · ${period(a)}`,
        highlights: [
          { label: 'Labour cost', value: formatPaise(rows.reduce((s, r) => s + r.labourCost, 0)) },
          { label: 'Material purchased', value: formatPaise(rows.reduce((s, r) => s + r.material, 0)) },
        ],
        tables: [{
          title: 'By site',
          columns: [
            { key: 'site', header: 'Site', width: 2 }, { key: 'manDays', header: 'Man-days', fmt: 'qty' }, { key: 'labourCost', header: 'Labour cost', fmt: 'money' },
            { key: 'material', header: 'Material (priced GRNs)', fmt: 'money' }, { key: 'wagesPaid', header: 'Wages paid', fmt: 'money' },
            { key: 'advances', header: 'Advances given', fmt: 'money' }, { key: 'supplierPaid', header: 'Supplier payments', fmt: 'money' },
          ],
          rows: [...rows, ...(unassigned ? [{ site: 'Supplier payments not tied to a site', manDays: null, labourCost: null, material: null, wagesPaid: null, advances: null, supplierPaid: unassigned }] : [])],
          totals: ['manDays', 'labourCost', 'material', 'wagesPaid', 'advances', 'supplierPaid'],
        }],
      };
    }
  }
}
