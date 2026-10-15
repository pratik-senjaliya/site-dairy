import { isoDateSchema, paiseSchema, parseSettings, qtySchema, uuidSchema } from '@site-diary/shared';
import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { allow, assertSite, me, siteParam, siteWhere } from '../../lib/auth';
import { write } from '../../lib/db';
import { HttpError } from '../../lib/errors';
import { day } from '../../lib/json';
import { prisma } from '../../lib/prisma';
import { body, param } from '../../lib/validate';
import { requestApproval } from '../sync/push';

export const purchase = Router();

purchase.get('/indents', allow('indent', 'V', 'C'), async (req, res) => {
  const m = me(req);
  const projectId = siteParam(m, req.query.projectId);
  res.json(
    await prisma.indent.findMany({
      where: { companyId: m.companyId, deletedAt: null, ...siteWhere(m), ...(projectId && { projectId }), ...(typeof req.query.status === 'string' && { status: req.query.status as never }) },
      include: { lines: { where: { deletedAt: null } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
  );
});

const poSchema = z.object({
  projectId: uuidSchema,
  supplierId: uuidSchema,
  indentId: uuidSchema.nullable().optional(),
  lines: z.array(z.object({ materialId: uuidSchema, qty: qtySchema.positive(), ratePaise: paiseSchema })).min(1),
});

purchase.get('/pos', allow('po', 'V', 'C'), async (req, res) => {
  const m = me(req);
  const projectId = siteParam(m, req.query.projectId);
  res.json(
    await prisma.purchaseOrder.findMany({
      where: { companyId: m.companyId, deletedAt: null, ...siteWhere(m), ...(projectId && { projectId }) },
      include: { lines: { where: { deletedAt: null } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
  );
});

// POs above the owner's threshold wait for the owner; smaller ones (or the owner's own) are approved at once.
purchase.post('/pos', allow('po', 'C'), async (req, res) => {
  const m = me(req);
  const input = body(poSchema, req);
  assertSite(m, input.projectId);
  const po = await write(m.companyId, async (tx) => {
    const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, companyId: m.companyId, deletedAt: null } });
    if (!supplier) throw new HttpError(400, 'Supplier not found', 'bad_supplier');
    const company = await tx.company.findUniqueOrThrow({ where: { id: m.companyId } });
    const threshold = parseSettings(company.settings).poApprovalAbovePaise;
    const total = input.lines.reduce((s, l) => s + Math.round(l.qty * l.ratePaise), 0);
    const needsOwner = m.role !== 'owner' && total > threshold;
    const count = await tx.purchaseOrder.count({ where: { companyId: m.companyId } });
    const created = await tx.purchaseOrder.create({
      data: {
        companyId: m.companyId, projectId: input.projectId, supplierId: input.supplierId, indentId: input.indentId ?? null,
        poNo: `PO-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`,
        status: needsOwner ? 'pending_approval' : 'approved', approvedById: needsOwner ? null : m.id,
        totalPaise: BigInt(total), createdById: m.id,
        lines: { create: input.lines.map((l) => ({ companyId: m.companyId, materialId: l.materialId, qty: l.qty, ratePaise: BigInt(l.ratePaise), createdById: m.id })) },
      },
      include: { lines: true },
    });
    if (input.indentId) await tx.indent.updateMany({ where: { id: input.indentId, companyId: m.companyId, status: 'approved' }, data: { status: 'ordered' } });
    if (needsOwner) await requestApproval(tx, m, input.projectId, 'purchaseOrder', created.id, null, `PO ${created.poNo} for ${supplier.name}`);
    await audit(tx, { me: m, ip: req.ip }, { action: 'create', entityType: 'purchaseOrder', entityId: created.id, after: created });
    return created;
  });
  res.status(201).json(po);
});

purchase.post('/pos/:id/status', allow('po', 'C'), async (req, res) => {
  const m = me(req);
  const { status } = body(z.object({ status: z.enum(['sent', 'received', 'partly_received', 'cancelled']) }), req);
  const po = await write(m.companyId, async (tx) => {
    const before = await tx.purchaseOrder.findFirst({ where: { id: param(req), companyId: m.companyId, deletedAt: null } });
    if (!before) throw new HttpError(404, 'Not found', 'not_found');
    assertSite(m, before.projectId);
    if (['pending_approval', 'rejected'].includes(before.status) && status !== 'cancelled') throw new HttpError(409, 'This PO is not approved', 'not_approved');
    const after = await tx.purchaseOrder.update({ where: { id: before.id }, data: { status } });
    await audit(tx, { me: m, ip: req.ip }, { action: 'update', entityType: 'purchaseOrder', entityId: before.id, before, after });
    return after;
  });
  res.json(po);
});

const paymentSchema = z.object({
  supplierId: uuidSchema,
  projectId: uuidSchema.nullable().optional(),
  amountPaise: paiseSchema.min(1),
  date: isoDateSchema,
  mode: z.enum(['cash', 'upi', 'bank']),
  reference: z.string().trim().max(100).nullable().optional(),
});

purchase.post('/supplier-payments', allow('wages', 'C'), async (req, res) => {
  const m = me(req);
  const input = body(paymentSchema, req);
  if (input.projectId) assertSite(m, input.projectId);
  const saved = await write(m.companyId, async (tx) => {
    const p = await tx.supplierPayment.create({ data: { ...input, date: day(input.date), amountPaise: BigInt(input.amountPaise), companyId: m.companyId, createdById: m.id } });
    await audit(tx, { me: m, ip: req.ip }, { action: 'create', entityType: 'supplierPayment', entityId: p.id, after: p });
    return p;
  });
  res.status(201).json(saved);
});

/** Supplier ledger: value of GRNs (line rate, else the PO rate) against payments made. */
export async function supplierLedger(companyId: string, supplierId: string) {
  const [grns, payments] = await Promise.all([
    prisma.grn.findMany({
      where: { companyId, supplierId, deletedAt: null },
      include: { lines: { where: { deletedAt: null } } },
      orderBy: { date: 'asc' },
    }),
    prisma.supplierPayment.findMany({ where: { companyId, supplierId, deletedAt: null }, orderBy: { date: 'asc' } }),
  ]);
  const poLines = await prisma.poLine.findMany({ where: { poId: { in: grns.map((g) => g.poId ?? '').filter(Boolean) }, deletedAt: null } });
  const entries = [
    ...grns.map((g) => {
      let unpriced = 0;
      const amount = g.lines.reduce((s, l) => {
        const rate = l.ratePaise ?? poLines.find((p) => p.poId === g.poId && p.materialId === l.materialId)?.ratePaise ?? null;
        if (rate == null) unpriced++;
        return s + Math.round((l.qty.toNumber() - l.rejectedQty.toNumber()) * Number(rate ?? 0));
      }, 0);
      return { date: g.date, kind: 'grn' as const, id: g.id, ref: g.challanNo, projectId: g.projectId, debitPaise: amount, creditPaise: 0, unpricedLines: unpriced };
    }),
    ...payments.map((p) => ({ date: p.date, kind: 'payment' as const, id: p.id, ref: p.reference, projectId: p.projectId, debitPaise: 0, creditPaise: Number(p.amountPaise), unpricedLines: 0 })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
  let balance = 0;
  const rows = entries.map((e) => ({ ...e, balancePaise: (balance += e.debitPaise - e.creditPaise) }));
  return { rows, duePaise: balance };
}

purchase.get('/supplier-ledger/:id', allow('po', 'V'), async (req, res) => {
  res.json(await supplierLedger(me(req).companyId, param(req)));
});
