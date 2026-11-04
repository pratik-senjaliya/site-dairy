import { can, contractWorkSchema, formatNumber, isoDate, measureAmount, uuidSchema, workMeasureSchema } from '@site-diary/shared';
import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { allow, allowRoles, assertSite, me } from '../../lib/auth';
import { write } from '../../lib/db';
import { HttpError } from '../../lib/errors';
import { day, isoOf } from '../../lib/json';
import { notify, recipients } from '../../lib/notify';
import { prisma } from '../../lib/prisma';
import { body, param, query } from '../../lib/validate';

// Contract work: what a contractor does at a rate per unit (centering per sq ft…) and the measurements of it.
// Rates are office work (owner, engineer, accountant); anyone who writes upad on site can write a measurement.
// Billing happens in the wage settlement (modules/wages), together with the contractor's days and upad.
export const work = Router();

const office = allowRoles('owner', 'engineer', 'accountant');

/** A site's contract work and its measurements: everything not yet billed, and the last 60 days of the rest. */
work.get('/', allow('wages', 'V', 'C'), async (req, res) => {
  const m = me(req);
  const q = query(z.object({ projectId: uuidSchema, contractorId: uuidSchema.optional() }), req);
  assertSite(m, q.projectId);
  const money = can(m.role, 'wages', 'V');
  const where = { companyId: m.companyId, projectId: q.projectId, deletedAt: null, ...(q.contractorId && { contractorId: q.contractorId }) };
  const since = day(isoDate(new Date(Date.now() - 60 * 86400_000)));
  const [works, measures, users] = await Promise.all([
    prisma.contractWork.findMany({ where, orderBy: { createdAt: 'asc' } }),
    prisma.workMeasure.findMany({ where: { ...where, OR: [{ settlementId: null }, { date: { gte: since } }] }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
    prisma.user.findMany({ where: { companyId: m.companyId }, select: { id: true, name: true } }),
  ]);
  res.json({
    works: works.map((w) => ({ id: w.id, contractorId: w.contractorId, name: w.name, unit: w.unit, ratePaise: money ? Number(w.ratePaise) : null })),
    measures: measures.map((x) => ({
      id: x.id, workId: x.workId, contractorId: x.contractorId, date: isoOf(x.date), qty: x.qty.toNumber(), place: x.place, note: x.note,
      ratePaise: money ? Number(x.ratePaise) : null, amountPaise: money ? measureAmount(x.qty.toNumber(), Number(x.ratePaise)) : null,
      billed: !!x.settlementId, by: users.find((u) => u.id === x.createdById)?.name ?? null, byId: x.createdById,
    })),
  });
});

work.post('/', office, async (req, res) => {
  const m = me(req);
  const { id, ...input } = body(contractWorkSchema, req);
  assertSite(m, input.projectId);
  const saved = await write(m.companyId, async (tx) => {
    if (!(await tx.contractor.findFirst({ where: { id: input.contractorId, companyId: m.companyId, deletedAt: null } }))) throw new HttpError(400, 'Contractor not found', 'bad_contractor');
    const before = id ? await tx.contractWork.findFirst({ where: { id, companyId: m.companyId, deletedAt: null } }) : null;
    const data = { ...input, ratePaise: BigInt(input.ratePaise) };
    const after = before
      ? await tx.contractWork.update({ where: { id: before.id }, data })
      : await tx.contractWork.create({ data: { ...data, ...(id && { id }), companyId: m.companyId, createdById: m.id } });
    await audit(tx, { me: m, ip: req.ip }, { action: before ? 'update' : 'create', entityType: 'contractWork', entityId: after.id, before, after });
    return after;
  });
  res.status(id ? 200 : 201).json({ id: saved.id });
});

work.delete('/:id', office, async (req, res) => {
  const m = me(req);
  await write(m.companyId, async (tx) => {
    const before = await tx.contractWork.findFirst({ where: { id: param(req), companyId: m.companyId, deletedAt: null } });
    if (!before) throw new HttpError(404, 'Not found', 'not_found');
    assertSite(m, before.projectId);
    if (await tx.workMeasure.count({ where: { workId: before.id, deletedAt: null, settlementId: null } })) throw new HttpError(409, 'This work has measurements not yet billed', 'has_measures');
    const after = await tx.contractWork.update({ where: { id: before.id }, data: { deletedAt: new Date() } });
    await audit(tx, { me: m, ip: req.ip }, { action: 'delete', entityType: 'contractWork', entityId: before.id, before, after });
  });
  res.json({ ok: true });
});

work.post('/measures', allow('wages', 'C'), async (req, res) => {
  const m = me(req);
  const { id, ...input } = body(workMeasureSchema, req);
  if (input.date > isoDate()) throw new HttpError(400, 'A measurement cannot be in the future', 'future');
  const saved = await write(m.companyId, async (tx) => {
    if (id && (await tx.workMeasure.findUnique({ where: { id } }))) throw new HttpError(409, 'Already saved', 'duplicate');
    const w = await tx.contractWork.findFirst({ where: { id: input.workId, companyId: m.companyId, deletedAt: null } });
    if (!w) throw new HttpError(400, 'Work not found', 'bad_work');
    assertSite(m, w.projectId);
    const x = await tx.workMeasure.create({
      data: { ...input, ...(id && { id }), date: day(input.date), companyId: m.companyId, projectId: w.projectId, contractorId: w.contractorId, ratePaise: w.ratePaise, createdById: m.id },
    });
    await audit(tx, { me: m, ip: req.ip }, { action: 'create', entityType: 'workMeasure', entityId: x.id, after: x });
    // The owner hears of measurements he did not write himself: they become money in the next bill.
    const contractor = await tx.contractor.findUnique({ where: { id: w.contractorId } });
    const to = (await recipients(tx, m.companyId, ['owner'])).filter((u) => u !== m.id);
    await notify(tx, m.companyId, to, {
      kind: 'work',
      title: { key: 'notify.measured', vars: { contractor: contractor?.name ?? '', work: w.name, qty: `${formatNumber(input.qty)} ${w.unit}` } },
      body: { key: 'notify.from', vars: { name: m.name } },
      entityType: 'workMeasure', entityId: x.id,
    });
    return x;
  });
  res.status(201).json({ id: saved.id });
});

/** A measurement not yet billed can be removed by the person who wrote it or the office. */
work.delete('/measures/:id', allow('wages', 'C'), async (req, res) => {
  const m = me(req);
  await write(m.companyId, async (tx) => {
    const before = await tx.workMeasure.findFirst({ where: { id: param(req), companyId: m.companyId, deletedAt: null } });
    if (!before) throw new HttpError(404, 'Not found', 'not_found');
    assertSite(m, before.projectId);
    if (before.settlementId) throw new HttpError(409, 'Already in a bill', 'billed');
    if (before.createdById !== m.id && !['owner', 'engineer', 'accountant'].includes(m.role)) throw new HttpError(403, 'Only the person who wrote it or the office can remove it', 'forbidden');
    const after = await tx.workMeasure.update({ where: { id: before.id }, data: { deletedAt: new Date() } });
    await audit(tx, { me: m, ip: req.ip }, { action: 'delete', entityType: 'workMeasure', entityId: before.id, before, after });
  });
  res.json({ ok: true });
});
