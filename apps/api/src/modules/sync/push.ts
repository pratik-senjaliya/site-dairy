import type { MessageKey } from '@site-diary/i18n';
import { Prisma } from '@prisma/client';
import {
  addDays, can, isoDate, pushRowSchemas, shortDate, PUSH_ORDER, type Module, type PushResult, type PushTable,
} from '@site-diary/shared';
import { ZodError } from 'zod';
import { audit, type AuditEntry } from '../../lib/audit';
import { assertSite, type Me } from '../../lib/auth';
import { write, type Tx } from '../../lib/db';
import { HttpError } from '../../lib/errors';
import { day } from '../../lib/json';
import { notify, recipients } from '../../lib/notify';
import { checkLowStock, rebuildLedger } from '../store/ledger';

type Row = Record<string, unknown>;
interface Delegate {
  findUnique(a: { where: { id: string } }): Promise<Row | null>;
  findFirst(a: { where: Row }): Promise<Row | null>;
  create(a: { data: Row }): Promise<Row>;
  update(a: { where: { id: string }; data: Row }): Promise<Row>;
}
const delegate = (tx: Tx, t: PushTable) => tx[t] as unknown as Delegate;

interface TableDef {
  module: Module | ((row: Row) => Module);
  /** Line tables take their site from the header row. */
  parent?: { table: 'indent' | 'grn'; field: string };
  /** Natural unique key: a second phone's row for the same key merges into the first. */
  naturalKey?: string[];
  dates?: string[];
  money?: string[];
  /** Fields the phone sends that are not stored. */
  drop?: string[];
}

const PHOTO_MODULE: Record<string, Module> = { attendance: 'attendance', grn: 'store', progress: 'progress', issue: 'progress', site_day: 'progress' };

const TABLES: Record<PushTable, TableDef> = {
  attendanceEntry: { module: 'attendance', naturalKey: ['projectId', 'date', 'contractorId', 'skillId'], dates: ['date'], drop: ['recordedOn'] },
  advance: { module: 'wages', dates: ['date'], money: ['amountPaise'] },
  indent: { module: 'indent', dates: ['neededBy'] },
  indentLine: { module: 'indent', parent: { table: 'indent', field: 'indentId' } },
  grn: { module: 'store', dates: ['date'] },
  grnLine: { module: 'store', parent: { table: 'grn', field: 'grnId' }, money: ['ratePaise'] },
  materialIssue: { module: 'store', dates: ['date'] },
  stockTransfer: { module: 'store' },
  siteDay: { module: 'progress', naturalKey: ['projectId', 'date'], dates: ['date'] },
  dailyProgress: { module: 'progress', dates: ['date'] },
  issue: { module: 'progress' },
  photo: { module: (r) => PHOTO_MODULE[String(r.sourceType)] ?? 'progress' },
};

/** Days a supervisor's offline attendance may arrive late without approval, if the phone recorded it on that day. */
const OFFLINE_GRACE_DAYS = 3;

interface Ctx {
  me: Me;
  ip: string | null;
  projects: Set<string>;
  /** Approved late edit: skip the attendance lock. */
  approved?: boolean;
  touched: { grn: Set<string>; issue: Set<string>; transfer: Set<string> };
  after: ((tx: Tx) => Promise<void>)[];
}

type Outcome = { kind: 'applied' } | { kind: 'pending' } | { kind: 'remapped'; to: string };

function toDb(def: TableDef, row: Row, companyId: string): Row {
  const data: Row = { ...row };
  delete data.id;
  for (const f of def.drop ?? []) delete data[f];
  for (const f of def.dates ?? []) if (typeof data[f] === 'string') data[f] = day(data[f] as string);
  for (const f of def.money ?? []) if (typeof data[f] === 'number') data[f] = BigInt(data[f] as number);
  if (typeof data.deletedAt === 'string') data.deletedAt = new Date(data.deletedAt);
  if (typeof data.takenAt === 'string') data.takenAt = new Date(data.takenAt);
  if (row.sourceType && row.projectId) data.storageKey = `${companyId}/${String(row.projectId)}/photos/${String(row.id)}.jpg`;
  return data;
}

async function projectOf(tx: Tx, def: TableDef, row: Row, companyId: string): Promise<string> {
  if (def.parent) {
    const parentId = String(row[def.parent.field]);
    const parent = await delegate(tx, def.parent.table).findUnique({ where: { id: parentId } });
    if (!parent || parent.companyId !== companyId) throw new HttpError(400, `${def.parent.table} ${parentId} not found`, 'missing_parent');
    return String(parent.projectId);
  }
  return String(row.projectId ?? row.fromProjectId);
}

/** Applies one validated row. Used by sync push, by web forms, and when a late edit is approved. */
export async function applyRow(tx: Tx, ctx: Ctx, table: PushTable, raw: Row): Promise<Outcome> {
  const def = TABLES[table];
  const row = pushRowSchemas[table].parse(raw) as Row;
  const { me } = ctx;
  const module = typeof def.module === 'function' ? def.module(row) : def.module;
  if (!ctx.approved && !can(me.role, module, 'C')) throw new HttpError(403, 'Your role cannot enter this', 'forbidden');

  const projectId = await projectOf(tx, def, row, me.companyId);
  if (!ctx.projects.has(projectId)) throw new HttpError(403, 'Unknown site', 'forbidden_site');
  const d = delegate(tx, table);
  const id = String(row.id);
  let existing = await d.findUnique({ where: { id } });
  if (existing && existing.companyId !== me.companyId) throw new HttpError(403, 'Not yours', 'forbidden');

  let targetId = id;
  if (!existing && def.naturalKey) {
    const byKey = await d.findFirst({ where: Object.fromEntries(def.naturalKey.map((k) => [k, (def.dates ?? []).includes(k) ? day(String(row[k])) : row[k]])) });
    if (byKey) {
      existing = byKey;
      targetId = String(byKey.id);
    }
  }

  // Transfers: the sending site creates; the receiving site confirms.
  if (table === 'stockTransfer') {
    const receiving = row.status === 'received' && existing?.status !== 'received';
    assertSite(me, receiving ? String(row.toProjectId) : String(row.fromProjectId));
    if (!ctx.projects.has(String(row.toProjectId))) throw new HttpError(403, 'Unknown site', 'forbidden_site');
    if (receiving) Object.assign(row, { receivedById: me.id, receivedAt: new Date() });
  } else {
    assertSite(me, projectId);
  }
  if (existing && existing.projectId && existing.projectId !== projectId) assertSite(me, String(existing.projectId));
  await guardSettled(tx, table, row, existing, projectId);

  // Attendance locks at midnight. Later edits by a supervisor go to an engineer for approval.
  if (table === 'attendanceEntry' && !ctx.approved) {
    const today = isoDate();
    const date = String(row.date);
    const late = date < today;
    const offlineCatchUp = row.recordedOn === date && date >= addDays(today, -OFFLINE_GRACE_DAYS) && !existing;
    if (late && !offlineCatchUp) {
      if (can(me.role, 'attendance', 'A')) {
        if (me.role !== 'owner') {
          ctx.after.push(async (t) =>
            notify(t, me.companyId, await recipients(t, me.companyId, ['owner']), {
              kind: 'late_edit', title: { key: 'notify.lateEdit', vars: { name: me.name } }, body: shortDate(date), entityType: 'attendanceEntry', entityId: targetId,
            }),
          );
        }
      } else {
        await requestApproval(tx, me, projectId, 'attendanceEntry', targetId, row, date);
        return { kind: 'pending' };
      }
    }
  }

  const data = toDb(def, row, me.companyId);
  // Status changes that only an approver may make never arrive through push.
  if (table === 'indent' && existing && !['draft', 'submitted'].includes(String(existing.status))) delete data.status;

  const saved = existing
    ? await d.update({ where: { id: targetId }, data })
    : await d.create({ data: { ...data, ...(table === 'indent' && { requestedById: me.id }), id: targetId, companyId: me.companyId, createdById: me.id } });

  const action = data.deletedAt ? 'delete' : existing ? 'update' : 'create';
  await audit(tx, { me, ip: ctx.ip }, { action, entityType: table, entityId: targetId, before: existing ?? undefined, after: saved } satisfies AuditEntry);

  if (table === 'grn') ctx.touched.grn.add(targetId);
  if (table === 'grnLine') ctx.touched.grn.add(String(row.grnId));
  if (table === 'materialIssue') ctx.touched.issue.add(targetId);
  if (table === 'stockTransfer') ctx.touched.transfer.add(targetId);
  if (table === 'indent' && row.status === 'submitted' && existing?.status !== 'submitted' && !data.deletedAt) {
    if (can(me.role, 'indent', 'A')) {
      // Someone who approves requests does not wait on himself: approved once all its lines are in.
      ctx.after.push(async (t) => {
        await t.indent.update({ where: { id: targetId }, data: { status: 'approved', approvedById: me.id } });
        await audit(t, { me, ip: ctx.ip }, { action: 'approve', entityType: 'indent', entityId: targetId });
      });
    } else {
      await requestApproval(tx, me, projectId, 'indent', targetId, null);
    }
  }
  if (table === 'issue' && row.assignedToId && row.assignedToId !== existing?.assignedToId) {
    ctx.after.push((t) => notify(t, me.companyId, [String(row.assignedToId)], { kind: 'issue_assigned', title: { key: 'notify.issueAssigned', vars: { title: String(row.title) } }, entityType: 'issue', entityId: targetId }));
  }
  if (table === 'issue' && row.status === 'resolved' && existing?.status !== 'resolved') {
    await tx.issue.update({ where: { id: targetId }, data: { resolvedAt: new Date() } });
  }
  return targetId === id ? { kind: 'applied' } : { kind: 'remapped', to: targetId };
}

const SETTLED = ['submitted', 'approved', 'paid'] as const;

/** Money and approvals already decided on a record freeze it: wages paid on attendance, approved indents, received transfers. */
async function guardSettled(tx: Tx, table: PushTable, row: Row, existing: Row | null, projectId: string) {
  if (table === 'attendanceEntry') {
    for (const r of existing ? [existing, row] : [row]) {
      const date = r.date instanceof Date ? r.date : day(String(r.date));
      const s = await tx.wageSettlement.findFirst({
        where: { projectId, contractorId: String(r.contractorId), deletedAt: null, status: { in: [...SETTLED] }, periodFrom: { lte: date }, periodTo: { gte: date } },
      });
      if (s) throw new HttpError(409, 'This day is already in a wage settlement. Cancel that settlement first.', 'settled');
    }
  }
  if (table === 'advance' && existing?.settlementId) throw new HttpError(409, 'This advance is already in a wage settlement', 'settled');
  if (table === 'indentLine') {
    const indent = await tx.indent.findUnique({ where: { id: String(row.indentId) } });
    if (indent && !['draft', 'submitted'].includes(indent.status)) throw new HttpError(409, 'This indent is already decided; raise a new one', 'decided');
  }
  if (table === 'indent' && existing && row.deletedAt && !['draft', 'submitted'].includes(String(existing.status))) {
    throw new HttpError(409, 'An approved indent cannot be deleted', 'decided');
  }
  if (table === 'stockTransfer' && existing?.status === 'received') throw new HttpError(409, 'This transfer was already received', 'received');
}

/** A GRN against a PO moves the PO to partly or fully received. */
async function updatePoStatus(tx: Tx, poId: string) {
  const po = await tx.purchaseOrder.findUnique({ where: { id: poId }, include: { lines: { where: { deletedAt: null } } } });
  if (!po || !['approved', 'sent', 'partly_received', 'received'].includes(po.status)) return;
  const lines = await tx.grnLine.findMany({ where: { deletedAt: null, grn: { poId, deletedAt: null } } });
  const got = (m: string) => lines.filter((l) => l.materialId === m).reduce((s, l) => s + l.qty.toNumber() - l.rejectedQty.toNumber(), 0);
  const any = lines.length > 0;
  const all = po.lines.every((l) => got(l.materialId) >= l.qty.toNumber() - 1e-9);
  const status = all && any ? 'received' : any ? 'partly_received' : po.status === 'received' || po.status === 'partly_received' ? 'sent' : po.status;
  if (status !== po.status) await tx.purchaseOrder.update({ where: { id: poId }, data: { status } });
}

const APPROVERS: Record<string, ('owner' | 'engineer')[]> = {
  attendanceEntry: ['engineer', 'owner'],
  indent: ['engineer', 'owner'],
  purchaseOrder: ['owner'],
  wageSettlement: ['owner'],
};

export async function requestApproval(tx: Tx, me: Me, projectId: string | null, entityType: string, entityId: string, proposal: Row | null, detail?: string) {
  const open = await tx.approval.findFirst({ where: { entityType, entityId, status: 'pending', deletedAt: null } });
  const proposalJson = proposal ? (JSON.parse(JSON.stringify(proposal)) as Prisma.InputJsonValue) : Prisma.DbNull;
  const approval = open
    ? await tx.approval.update({ where: { id: open.id }, data: { proposal: proposalJson, requestedById: me.id } })
    : await tx.approval.create({ data: { companyId: me.companyId, projectId, entityType, entityId, proposal: proposalJson, requestedById: me.id, createdById: me.id } });
  const to = (await recipients(tx, me.companyId, APPROVERS[entityType] ?? ['owner'], projectId)).filter((id) => id !== me.id);
  await notify(tx, me.companyId, to, { kind: 'approval_needed', title: { key: 'notify.approvalNeeded', vars: { what: { key: `approval.${entityType}` as MessageKey } } }, body: detail ? { key: 'notify.fromDetail', vars: { name: me.name, detail } } : { key: 'notify.from', vars: { name: me.name } }, entityType: 'approval', entityId: approval.id });
  return approval;
}

export function newCtx(me: Me, ip: string | null, projects: string[], approved = false): Ctx {
  return { me, ip, projects: new Set(projects), approved, touched: { grn: new Set(), issue: new Set(), transfer: new Set() }, after: [] };
}

/** Ledger rebuilds, low-stock checks and notices after the rows of one push are in. */
export async function finish(tx: Tx, ctx: Ctx) {
  const pairs: [string, string][] = [];
  const pos = new Set<string>();
  for (const id of ctx.touched.grn) {
    pairs.push(...(await rebuildLedger(tx, ctx.me.companyId, 'grn', id)));
    const grn = await tx.grn.findUnique({ where: { id }, select: { poId: true } });
    if (grn?.poId) pos.add(grn.poId);
  }
  for (const poId of pos) await updatePoStatus(tx, poId);
  for (const id of ctx.touched.issue) pairs.push(...(await rebuildLedger(tx, ctx.me.companyId, 'issue', id)));
  for (const id of ctx.touched.transfer) pairs.push(...(await rebuildLedger(tx, ctx.me.companyId, 'transfer', id)));
  await checkLowStock(tx, ctx.me.companyId, pairs);
  for (const fn of ctx.after) await fn(tx);
}

export async function companyProjects(tx: Tx, companyId: string) {
  return (await tx.project.findMany({ where: { companyId }, select: { id: true } })).map((p) => p.id);
}

/** Idempotent: rows carry client UUIDs, so a retried push re-applies the same values. */
export async function push(me: Me, ip: string | null, changes: Record<string, Row[]>): Promise<PushResult> {
  const result: PushResult = { applied: 0, remapped: {}, pending: [], rejected: [] };
  for (const table of Object.keys(changes)) {
    if (!(PUSH_ORDER as string[]).includes(table)) throw new HttpError(400, `Unknown table ${table}`, 'bad_table');
  }
  await write(me.companyId, async (tx) => {
    const ctx = newCtx(me, ip, await companyProjects(tx, me.companyId));
    for (const table of PUSH_ORDER) {
      for (const row of changes[table] ?? []) {
        const id = String(row.id ?? '');
        await tx.$executeRawUnsafe('SAVEPOINT push_row');
        try {
          const outcome = await applyRow(tx, ctx, table, row);
          await tx.$executeRawUnsafe('RELEASE SAVEPOINT push_row');
          if (outcome.kind === 'pending') result.pending.push(id);
          else result.applied++;
          if (outcome.kind === 'remapped') result.remapped[id] = outcome.to;
        } catch (e) {
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT push_row');
          result.rejected.push({ table, id, reason: reasonOf(e) });
        }
      }
    }
    await finish(tx, ctx);
  });
  return result;
}

function reasonOf(e: unknown): string {
  if (e instanceof HttpError) return e.message;
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  if (e instanceof Prisma.PrismaClientKnownRequestError) return `Database refused the row (${e.code})`;
  console.error('push row failed', e);
  return 'Server error';
}
