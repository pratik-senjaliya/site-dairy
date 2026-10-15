import { isoDateSchema, uuidSchema } from '@site-diary/shared';
import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { allow, assertSite, me, siteParam, siteWhere } from '../../lib/auth';
import { write } from '../../lib/db';
import { HttpError } from '../../lib/errors';
import { day } from '../../lib/json';
import { prisma } from '../../lib/prisma';
import { body, param, query } from '../../lib/validate';
import { requestApproval } from '../sync/push';
import { previewWages } from './service';

export const wages = Router();

const period = z.object({ projectId: uuidSchema, contractorId: uuidSchema, from: isoDateSchema, to: isoDateSchema }).refine((p) => p.from <= p.to, 'Start is after end');

wages.get('/preview', allow('wages', 'V', 'C'), async (req, res) => {
  const q = query(period, req);
  assertSite(me(req), q.projectId);
  res.json(await previewWages(prisma, q.projectId, q.contractorId, q.from, q.to));
});

wages.get('/', allow('wages', 'V'), async (req, res) => {
  const m = me(req);
  const projectId = siteParam(m, req.query.projectId);
  const rows = await prisma.wageSettlement.findMany({
    where: { companyId: m.companyId, deletedAt: null, ...siteWhere(m), ...(projectId && { projectId }) },
    orderBy: { periodTo: 'desc' },
    take: 300,
  });
  res.json(rows);
});

// Weekly/fortnightly settlement: computed on the server, then the owner approves, then it is marked paid.
wages.post('/', allow('wages', 'C'), async (req, res) => {
  const m = me(req);
  const input = body(period, req);
  assertSite(m, input.projectId);
  const saved = await write(m.companyId, async (tx) => {
    const overlap = await tx.wageSettlement.findFirst({
      where: { contractorId: input.contractorId, projectId: input.projectId, deletedAt: null, status: { not: 'rejected' }, periodFrom: { lte: day(input.to) }, periodTo: { gte: day(input.from) } },
    });
    if (overlap) throw new HttpError(409, 'These days are already in another settlement', 'overlap');
    const p = await previewWages(tx, input.projectId, input.contractorId, input.from, input.to);
    if (p.missingRates.length) throw new HttpError(400, 'Some skills have no rate for this contractor. Add rates first.', 'missing_rates');
    if (!p.manDays) throw new HttpError(400, 'No attendance in this period', 'empty');
    const owner = m.role === 'owner';
    const s = await tx.wageSettlement.create({
      data: {
        companyId: m.companyId, projectId: input.projectId, contractorId: input.contractorId, periodFrom: day(input.from), periodTo: day(input.to),
        grossPaise: BigInt(p.gross), advancesPaise: BigInt(p.advances), netPaise: BigInt(p.net),
        status: owner ? 'approved' : 'submitted', approvedById: owner ? m.id : null, createdById: m.id,
      },
    });
    await tx.advance.updateMany({ where: { id: { in: p.advanceIds } }, data: { settlementId: s.id } });
    if (!owner) await requestApproval(tx, m, input.projectId, 'wageSettlement', s.id, null, 'Wage settlement');
    await audit(tx, { me: m, ip: req.ip }, { action: 'create', entityType: 'wageSettlement', entityId: s.id, after: s });
    return s;
  });
  res.status(201).json(saved);
});

wages.post('/:id/pay', allow('wages', 'C'), async (req, res) => {
  const m = me(req);
  const { mode } = body(z.object({ mode: z.enum(['cash', 'upi', 'bank']) }), req);
  const saved = await write(m.companyId, async (tx) => {
    const before = await tx.wageSettlement.findFirst({ where: { id: param(req), companyId: m.companyId, deletedAt: null } });
    if (!before) throw new HttpError(404, 'Not found', 'not_found');
    assertSite(m, before.projectId);
    if (before.status !== 'approved') throw new HttpError(409, 'Only an approved settlement can be paid', 'not_approved');
    const s = await tx.wageSettlement.update({ where: { id: before.id }, data: { status: 'paid', paidAt: new Date(), paidMode: mode } });
    await audit(tx, { me: m, ip: req.ip }, { action: 'pay', entityType: 'wageSettlement', entityId: s.id, before, after: s });
    return s;
  });
  res.json(saved);
});

/** A rejected settlement frees its advances for the next one. */
wages.post('/:id/cancel', allow('wages', 'C'), async (req, res) => {
  const m = me(req);
  const saved = await write(m.companyId, async (tx) => {
    const before = await tx.wageSettlement.findFirst({ where: { id: param(req), companyId: m.companyId, deletedAt: null } });
    if (!before) throw new HttpError(404, 'Not found', 'not_found');
    assertSite(m, before.projectId);
    if (before.status === 'paid') throw new HttpError(409, 'A paid settlement cannot be cancelled', 'paid');
    const s = await tx.wageSettlement.update({ where: { id: before.id }, data: { deletedAt: new Date() } });
    await tx.advance.updateMany({ where: { settlementId: before.id }, data: { settlementId: null } });
    await tx.approval.updateMany({ where: { entityId: before.id, status: 'pending' }, data: { status: 'withdrawn' } });
    await audit(tx, { me: m, ip: req.ip }, { action: 'delete', entityType: 'wageSettlement', entityId: s.id, before });
    return s;
  });
  res.json(saved);
});

wages.get('/advances', allow('wages', 'V', 'C'), async (req, res) => {
  const m = me(req);
  const projectId = siteParam(m, req.query.projectId);
  res.json(
    await prisma.advance.findMany({
      where: {
        companyId: m.companyId, deletedAt: null, ...siteWhere(m), ...(projectId && { projectId }),
        ...(typeof req.query.contractorId === 'string' && { contractorId: req.query.contractorId }),
      },
      orderBy: { date: 'desc' },
      take: 500,
    }),
  );
});
