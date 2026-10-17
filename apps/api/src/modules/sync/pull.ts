import type { Prisma } from '@prisma/client';
import { addDays, canSee, isoDate, type PullResponse, type PullTable } from '@site-diary/shared';
import type { Me } from '../../lib/auth';
import { highWaterMark } from '../../lib/db';
import { day } from '../../lib/json';
import { prisma } from '../../lib/prisma';
import { stockFor } from '../store/ledger';

/** Days of daily entries a phone keeps (scope: "works fully offline for a site's last 30 days"). */
export const OFFLINE_DAYS = 30;

type Where = Record<string, unknown>;
type Finder = (where: Where) => Promise<Record<string, unknown>[]>;

// Everything with server_rev in (since, hwm] that this user may see. The first pull (since = 0)
// skips deleted rows and limits daily entries to the last 30 days.
export async function pull(me: Me, since: bigint): Promise<PullResponse> {
  const hwm = await highWaterMark(me.companyId);
  const first = since === 0n;
  const today = isoDate();
  const from = day(addDays(today, -OFFLINE_DAYS));

  const sites = (
    await prisma.project.findMany({ where: { companyId: me.companyId, deletedAt: null, ...(me.sites !== 'all' && { id: { in: me.sites } }) }, select: { id: true } })
  ).map((p) => p.id);
  const site = { projectId: { in: sites } };
  const recent = (field: string) => (first ? { [field]: { gte: from } } : {});

  const p = prisma;
  const tables: [PullTable, boolean, Finder, Where][] = [
    ['project', true, (w) => p.project.findMany({ where: w as Prisma.ProjectWhereInput }), { id: { in: sites } }],
    ['structureNode', true, (w) => p.structureNode.findMany({ where: w as Prisma.StructureNodeWhereInput }), site],
    ['workItem', true, (w) => p.workItem.findMany({ where: w as Prisma.WorkItemWhereInput }), site],
    ['contractor', true, (w) => p.contractor.findMany({ where: w as Prisma.ContractorWhereInput }), {}],
    ['skill', true, (w) => p.skill.findMany({ where: w as Prisma.SkillWhereInput }), {}],
    ['worker', true, (w) => p.worker.findMany({ where: w as Prisma.WorkerWhereInput }), {}],
    ['material', true, (w) => p.material.findMany({ where: w as Prisma.MaterialWhereInput }), {}],
    ['supplier', true, (w) => p.supplier.findMany({ where: w as Prisma.SupplierWhereInput }), {}],
    ['siteMaterialSetting', true, (w) => p.siteMaterialSetting.findMany({ where: w as Prisma.SiteMaterialSettingWhereInput }), site],
    [
      'user', true,
      (w) => p.user.findMany({ where: w as Prisma.UserWhereInput, select: { id: true, name: true, role: true, isActive: true, deletedAt: true, serverRev: true } }),
      {},
    ],
    ['purchaseOrder', canSee(me.role, 'store'), (w) => p.purchaseOrder.findMany({ where: w as Prisma.PurchaseOrderWhereInput }), { ...site, ...(first && { status: { in: ['approved', 'sent', 'partly_received'] } }) }],
    ['poLine', canSee(me.role, 'store'), (w) => p.poLine.findMany({ where: w as Prisma.PoLineWhereInput }), { po: { ...site, ...(first && { status: { in: ['approved', 'sent', 'partly_received'] } }) } }],
    ['photo', true, (w) => p.photo.findMany({ where: w as Prisma.PhotoWhereInput }), { ...site, ...recent('takenAt') }],
    ['attendanceEntry', canSee(me.role, 'attendance'), (w) => p.attendanceEntry.findMany({ where: w as Prisma.AttendanceEntryWhereInput }), { ...site, ...recent('date') }],
    ['advance', canSee(me.role, 'wages'), (w) => p.advance.findMany({ where: w as Prisma.AdvanceWhereInput }), { ...site, ...recent('date') }],
    ['indent', canSee(me.role, 'indent'), (w) => p.indent.findMany({ where: w as Prisma.IndentWhereInput }), { ...site, ...recent('createdAt') }],
    ['indentLine', canSee(me.role, 'indent'), (w) => p.indentLine.findMany({ where: w as Prisma.IndentLineWhereInput }), { indent: { ...site, ...recent('createdAt') } }],
    ['grn', canSee(me.role, 'store'), (w) => p.grn.findMany({ where: w as Prisma.GrnWhereInput }), { ...site, ...recent('date') }],
    ['grnLine', canSee(me.role, 'store'), (w) => p.grnLine.findMany({ where: w as Prisma.GrnLineWhereInput }), { grn: { ...site, ...recent('date') } }],
    ['materialIssue', canSee(me.role, 'store'), (w) => p.materialIssue.findMany({ where: w as Prisma.MaterialIssueWhereInput }), { ...site, ...recent('date') }],
    [
      'stockTransfer', canSee(me.role, 'store'),
      (w) => p.stockTransfer.findMany({ where: w as Prisma.StockTransferWhereInput }),
      { OR: [{ fromProjectId: { in: sites } }, { toProjectId: { in: sites } }], ...(first && { OR: [{ status: 'sent' }, { createdAt: { gte: from } }] }) },
    ],
    ['siteDay', true, (w) => p.siteDay.findMany({ where: w as Prisma.SiteDayWhereInput }), { ...site, ...recent('date') }],
    ['dailyProgress', true, (w) => p.dailyProgress.findMany({ where: w as Prisma.DailyProgressWhereInput }), { ...site, ...recent('date') }],
    ['issue', true, (w) => p.issue.findMany({ where: w as Prisma.IssueWhereInput }), { ...site, ...(first && { OR: [{ status: 'open' }, { createdAt: { gte: from } }] }) }],
  ];

  const changes: PullResponse['changes'] = {};
  await Promise.all(
    tables.map(async ([name, visible, find, scope]) => {
      if (!visible) return;
      // Transfers carry their own OR for sites; AND keeps both conditions when the first-pull OR is added.
      const where: Where = {
        companyId: me.companyId,
        serverRev: { gt: since, lte: hwm },
        ...(first && { deletedAt: null }),
        AND: [scope],
      };
      const rows = await find(where);
      if (rows.length) changes[name] = rows;
    }),
  );

  const stock = canSee(me.role, 'store') ? await stockFor(prisma, me.companyId, sites) : [];
  return { rev: hwm.toString(), changes, stock, today, sites };
}
