import { masterSchemas, type MasterKind, type Role } from '@site-diary/shared';
import { Router } from 'express';
import { audit } from '../../lib/audit';
import { assertSite, me, type Me } from '../../lib/auth';
import { write, type Tx } from '../../lib/db';
import { HttpError } from '../../lib/errors';
import { day } from '../../lib/json';
import { prisma } from '../../lib/prisma';
import { param } from '../../lib/validate';

type Row = Record<string, unknown>;
interface Delegate {
  findMany(a: { where: Row; orderBy?: Row | Row[] }): Promise<Row[]>;
  findUnique(a: { where: { id: string } }): Promise<Row | null>;
  create(a: { data: Row }): Promise<Row>;
  update(a: { where: { id: string }; data: Row }): Promise<Row>;
}

// Who may change each master list (everyone signed in may read). W3: owner, engineer; W6: store, owner.
// Supervisors may add a contractor or supplier by name when a new one turns up at the gate (rates stay with the office).
const WRITERS: Record<MasterKind, Role[]> = {
  contractor: ['owner', 'engineer', 'supervisor'],
  skill: ['owner', 'engineer'],
  contractorRate: ['owner', 'engineer'],
  worker: ['owner', 'engineer', 'supervisor'],
  material: ['owner', 'store'],
  supplier: ['owner', 'store', 'engineer', 'supervisor'],
  siteMaterialSetting: ['owner', 'store'],
  workItem: ['owner', 'engineer'],
  structureNode: ['owner', 'engineer'],
  workItemTemplate: ['owner'],
};
const ORDER: Partial<Record<MasterKind, Row | Row[]>> = {
  contractor: { name: 'asc' }, skill: { sort: 'asc' }, material: { nameEn: 'asc' }, supplier: { name: 'asc' }, worker: { name: 'asc' },
  workItem: { sort: 'asc' }, workItemTemplate: [{ projectType: 'asc' }, { sort: 'asc' }], structureNode: [{ sort: 'asc' }, { name: 'asc' }], contractorRate: { effectiveFrom: 'desc' },
};
const SITE_SCOPED: MasterKind[] = ['siteMaterialSetting', 'workItem', 'structureNode'];
const DATES = ['effectiveFrom'];
const MONEY = ['dailyRatePaise'];

const delegate = (tx: Tx | typeof prisma, kind: MasterKind) => tx[kind] as unknown as Delegate;
const isKind = (k: string): k is MasterKind => k in masterSchemas;

function kindOf(raw: string): MasterKind {
  if (!isKind(raw)) throw new HttpError(404, 'Not found', 'not_found');
  return raw;
}

function toDb(data: Row): Row {
  const out = { ...data };
  for (const f of DATES) if (typeof out[f] === 'string') out[f] = day(out[f] as string);
  for (const f of MONEY) if (typeof out[f] === 'number') out[f] = BigInt(out[f] as number);
  return out;
}

function canWrite(m: Me, kind: MasterKind) {
  if (!WRITERS[kind].includes(m.role)) throw new HttpError(403, 'You do not have permission to change this list', 'forbidden');
}

export const masters = Router();

// Daily rates are money: owner, engineer and accountant only.
const READERS: Partial<Record<MasterKind, Role[]>> = { contractorRate: ['owner', 'engineer', 'accountant'] };

masters.get('/:kind', async (req, res) => {
  const m = me(req);
  const kind = kindOf(param(req, 'kind'));
  if (READERS[kind] && !READERS[kind].includes(m.role)) throw new HttpError(403, 'You do not have permission to see this list', 'forbidden');
  const where: Row = { companyId: m.companyId, deletedAt: null };
  if (typeof req.query.projectId === 'string') {
    assertSite(m, req.query.projectId);
    where.projectId = req.query.projectId;
  } else if (SITE_SCOPED.includes(kind) && m.sites !== 'all') {
    where.projectId = { in: m.sites };
  }
  if (typeof req.query.contractorId === 'string') where.contractorId = req.query.contractorId;
  res.json(await delegate(prisma, kind).findMany({ where, orderBy: ORDER[kind] }));
});

/** Shared by the REST routes and the Excel import. */
export async function saveMaster(m: Me, ip: string | null, kind: MasterKind, input: unknown, id?: string) {
  canWrite(m, kind);
  const data = masterSchemas[kind].parse(input) as Row;
  if (typeof data.projectId === 'string') assertSite(m, data.projectId);
  return write(m.companyId, async (tx) => {
    if (typeof data.projectId === 'string') {
      const project = await tx.project.findUnique({ where: { id: data.projectId } });
      if (!project || project.companyId !== m.companyId) throw new HttpError(404, 'Site not found', 'not_found');
    }
    const d = delegate(tx, kind);
    const before = id ? await d.findUnique({ where: { id } }) : null;
    if (id && (!before || before.companyId !== m.companyId || before.deletedAt)) throw new HttpError(404, 'Not found', 'not_found');
    let saved: Row;
    try {
      saved = before
        ? await d.update({ where: { id: id! }, data: toDb(data) })
        : await d.create({ data: { ...toDb(data), companyId: m.companyId, createdById: m.id } });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new HttpError(409, 'This already exists', 'duplicate');
      throw e;
    }
    await audit(tx, { me: m, ip }, { action: before ? 'update' : 'create', entityType: kind, entityId: String(saved.id), before, after: saved });
    return saved;
  });
}

masters.post('/:kind', async (req, res) => {
  res.status(201).json(await saveMaster(me(req), req.ip ?? null, kindOf(param(req, 'kind')), req.body));
});

masters.patch('/:kind/:id', async (req, res) => {
  res.json(await saveMaster(me(req), req.ip ?? null, kindOf(param(req, 'kind')), req.body, param(req)));
});

masters.delete('/:kind/:id', async (req, res) => {
  const m = me(req);
  const kind = kindOf(param(req, 'kind'));
  canWrite(m, kind);
  const saved = await write(m.companyId, async (tx) => {
    const d = delegate(tx, kind);
    const before = await d.findUnique({ where: { id: param(req) } });
    if (!before || before.companyId !== m.companyId || before.deletedAt) throw new HttpError(404, 'Not found', 'not_found');
    if (typeof before.projectId === 'string') assertSite(m, before.projectId);
    const after = await d.update({ where: { id: param(req) }, data: { deletedAt: new Date() } });
    await audit(tx, { me: m, ip: req.ip }, { action: 'delete', entityType: kind, entityId: param(req), before });
    return after;
  });
  res.json(saved);
});

