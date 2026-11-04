import { bookTotals, formatPaise, isoDate, isoDateSchema, moneyEntrySchema, payStagesSchema, unitAccount, unitSchedule, unitSchema, type BookLine, type PayStage } from '@site-diary/shared';
import { z } from 'zod';
import { Router } from 'express';
import { audit } from '../../lib/audit';
import { allow, me, siteParam, type Me } from '../../lib/auth';
import { write, type Tx } from '../../lib/db';
import { HttpError } from '../../lib/errors';
import { day, isoOf } from '../../lib/json';
import { notify, recipients, type Msg } from '../../lib/notify';
import { prisma } from '../../lib/prisma';
import { body, param } from '../../lib/validate';

// The partners' book (flats, buyers' payments, money in and out). Every line says who wrote it; a line is never
// edited, only removed and written again, and a removed line stays in the book with who removed it.
export const accounts = Router();

/** Everything for one site (or all sites): book lines newest first, flats with what each buyer has paid, totals. */
export async function book(companyId: string, projectId?: string) {
  const site = projectId ? { projectId } : {};
  const [entries, supplierPayments, advances, settlements, units, users, suppliers, contractors, stageRows] = await Promise.all([
    prisma.moneyEntry.findMany({ where: { companyId, ...site, OR: [{ deletedAt: null }, { deletedById: { not: null } }] } }),
    prisma.supplierPayment.findMany({ where: { companyId, deletedAt: null, ...site } }),
    prisma.advance.findMany({ where: { companyId, deletedAt: null, ...site } }),
    prisma.wageSettlement.findMany({ where: { companyId, deletedAt: null, status: 'paid', ...site } }),
    prisma.unit.findMany({ where: { companyId, deletedAt: null, ...site }, orderBy: { name: 'asc' } }),
    prisma.user.findMany({ where: { companyId }, select: { id: true, name: true } }),
    prisma.supplier.findMany({ where: { companyId }, select: { id: true, name: true } }),
    prisma.contractor.findMany({ where: { companyId }, select: { id: true, name: true } }),
    prisma.payStage.findMany({ where: { companyId, deletedAt: null, ...site }, orderBy: { sort: 'asc' } }),
  ]);
  const stages = stageRows.map((s) => ({ id: s.id, projectId: s.projectId, name: s.name, percent: s.percent.toNumber(), sort: s.sort, reachedOn: s.reachedOn ? isoOf(s.reachedOn) : null }));
  const who = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;
  const contractor = (id: string) => contractors.find((x) => x.id === id)?.name ?? null;
  const lines: BookLine[] = [
    ...entries.map((e) => ({
      id: e.id, source: 'entry' as const, projectId: e.projectId, direction: e.direction, kind: e.kind as BookLine['kind'], unitId: e.unitId, party: e.party,
      amountPaise: Number(e.amountPaise), date: isoOf(e.date), mode: e.mode, reference: e.reference, note: e.note, by: who(e.createdById), byId: e.createdById, at: e.createdAt.toISOString(),
      removed: e.deletedAt ? { by: who(e.deletedById), at: e.deletedAt.toISOString() } : null,
    })),
    ...supplierPayments.map((p) => ({
      id: p.id, source: 'supplier' as const, projectId: p.projectId, direction: 'out' as const, kind: 'supplier' as const, unitId: null, party: suppliers.find((s) => s.id === p.supplierId)?.name ?? null,
      amountPaise: Number(p.amountPaise), date: isoOf(p.date), mode: p.mode, reference: p.reference, note: null, by: who(p.createdById), byId: p.createdById, at: p.createdAt.toISOString(), removed: null,
    })),
    ...advances.map((a) => ({
      id: a.id, source: 'upad' as const, projectId: a.projectId, direction: 'out' as const, kind: 'upad' as const, unitId: null, party: contractor(a.contractorId),
      amountPaise: Number(a.amountPaise), date: isoOf(a.date), mode: a.mode, reference: null, note: null, by: who(a.createdById), byId: a.createdById, at: a.createdAt.toISOString(), removed: null,
    })),
    ...settlements.filter((w) => Number(w.netPaise) > 0).map((w) => ({
      id: w.id, source: 'wages' as const, projectId: w.projectId, direction: 'out' as const, kind: 'wages' as const, unitId: null, party: contractor(w.contractorId),
      amountPaise: Number(w.netPaise), date: isoDate(w.paidAt ?? w.updatedAt), mode: w.paidMode, reference: null, note: `${isoOf(w.periodFrom)} – ${isoOf(w.periodTo)}`,
      by: who(w.approvedById ?? w.createdById), byId: w.approvedById ?? w.createdById, at: (w.paidAt ?? w.updatedAt).toISOString(), removed: null,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
  return {
    lines,
    totals: bookTotals(lines),
    stages,
    units: units.map((u) => {
      const deal = u.dealPaise == null ? null : Number(u.dealPaise);
      const account = unitAccount(deal, lines, u.id);
      const plan: PayStage[] = stages.filter((s) => s.projectId === u.projectId);
      return {
        id: u.id, projectId: u.projectId, name: u.name, buyerName: u.buyerName, buyerPhone: u.buyerPhone, note: u.note,
        dealPaise: deal, ...account, schedule: unitSchedule(deal, plan, account.receivedPaise),
      };
    }),
  };
}

accounts.get('/', allow('accounts', 'V'), async (req, res) => {
  const m = me(req);
  res.json(await book(m.companyId, siteParam(m, req.query.projectId)));
});

/** Everyone who keeps the book hears of a new or removed line, except the person who wrote it. */
async function tell(tx: Tx, m: Me, title: Msg, entityId: string) {
  const to = (await recipients(tx, m.companyId, ['owner', 'partner', 'accountant'])).filter((id) => id !== m.id);
  await notify(tx, m.companyId, to, { kind: 'money', title, body: { key: 'notify.from', vars: { name: m.name } }, entityType: 'moneyEntry', entityId });
}

accounts.post('/units', allow('accounts', 'C'), async (req, res) => {
  const m = me(req);
  const { id, ...input } = body(unitSchema, req);
  siteParam(m, input.projectId);
  const saved = await write(m.companyId, async (tx) => {
    const before = id ? await tx.unit.findFirst({ where: { id, companyId: m.companyId, deletedAt: null } }) : null;
    if (id && !before) throw new HttpError(404, 'Not found', 'not_found');
    const data = { ...input, dealPaise: input.dealPaise == null ? null : BigInt(input.dealPaise) };
    const after = before
      ? await tx.unit.update({ where: { id: before.id }, data })
      : await tx.unit.create({ data: { ...data, ...(id && { id }), companyId: m.companyId, createdById: m.id } });
    await audit(tx, { me: m, ip: req.ip }, { action: before ? 'update' : 'create', entityType: 'unit', entityId: after.id, before, after });
    return after;
  });
  res.status(id ? 200 : 201).json({ id: saved.id });
});

accounts.delete('/units/:id', allow('accounts', 'C'), async (req, res) => {
  const m = me(req);
  await write(m.companyId, async (tx) => {
    const before = await tx.unit.findFirst({ where: { id: param(req), companyId: m.companyId, deletedAt: null } });
    if (!before) throw new HttpError(404, 'Not found', 'not_found');
    if (await tx.moneyEntry.count({ where: { unitId: before.id, deletedAt: null } })) throw new HttpError(409, 'This flat has payments; remove them first', 'has_payments');
    const after = await tx.unit.update({ where: { id: before.id }, data: { deletedAt: new Date() } });
    await audit(tx, { me: m, ip: req.ip }, { action: 'delete', entityType: 'unit', entityId: before.id, before, after });
  });
  res.json({ ok: true });
});

accounts.post('/entries', allow('accounts', 'C'), async (req, res) => {
  const m = me(req);
  const { id, ...input } = body(moneyEntrySchema, req);
  const saved = await write(m.companyId, async (tx) => {
    if (id && (await tx.moneyEntry.findUnique({ where: { id } }))) throw new HttpError(409, 'Already saved', 'duplicate');
    let projectId = input.projectId ?? null;
    let what = input.party ?? '';
    if (input.unitId) {
      const unit = await tx.unit.findFirst({ where: { id: input.unitId, companyId: m.companyId, deletedAt: null } });
      if (!unit) throw new HttpError(400, 'Flat not found', 'bad_unit');
      projectId = unit.projectId;
      what = [unit.name, unit.buyerName].filter(Boolean).join(' · ');
    }
    if (projectId) siteParam(m, projectId);
    const e = await tx.moneyEntry.create({
      data: { ...input, ...(id && { id }), projectId, date: day(input.date), amountPaise: BigInt(input.amountPaise), companyId: m.companyId, createdById: m.id },
    });
    await audit(tx, { me: m, ip: req.ip }, { action: 'create', entityType: 'moneyEntry', entityId: e.id, after: e });
    await tell(tx, m, { key: input.direction === 'in' ? 'notify.moneyIn' : 'notify.moneyOut', vars: { amount: formatPaise(input.amountPaise), what: what || { key: `money.${input.direction}.${input.kind}` as 'money.in.flat' } } }, e.id);
    return e;
  });
  res.status(201).json({ id: saved.id });
});

// Only the person who wrote a line, or the owner, may remove it; the line stays visible as removed.
accounts.delete('/entries/:id', allow('accounts', 'C'), async (req, res) => {
  const m = me(req);
  await write(m.companyId, async (tx) => {
    const before = await tx.moneyEntry.findFirst({ where: { id: param(req), companyId: m.companyId, deletedAt: null } });
    if (!before) throw new HttpError(404, 'Not found', 'not_found');
    if (before.createdById !== m.id && m.role !== 'owner') throw new HttpError(403, 'Only the person who wrote it or the owner can remove it', 'forbidden');
    const after = await tx.moneyEntry.update({ where: { id: before.id }, data: { deletedAt: new Date(), deletedById: m.id } });
    await audit(tx, { me: m, ip: req.ip }, { action: 'delete', entityType: 'moneyEntry', entityId: before.id, before, after });
    await tell(tx, m, { key: 'notify.moneyRemoved', vars: { amount: formatPaise(Number(before.amountPaise)), what: before.party ?? '' } }, before.id);
  });
  res.json({ ok: true });
});

/** A site's payment plan for buyers: the whole list is saved at once; stages kept by id keep their "reached" date. */
accounts.put('/stages', allow('accounts', 'C'), async (req, res) => {
  const m = me(req);
  const input = body(payStagesSchema, req);
  siteParam(m, input.projectId);
  await write(m.companyId, async (tx) => {
    const before = await tx.payStage.findMany({ where: { companyId: m.companyId, projectId: input.projectId, deletedAt: null } });
    const keep = new Set(input.stages.map((s) => s.id).filter(Boolean));
    for (const old of before.filter((b) => !keep.has(b.id))) await tx.payStage.update({ where: { id: old.id }, data: { deletedAt: new Date() } });
    for (const [sort, s] of input.stages.entries()) {
      const was = before.find((b) => b.id === s.id);
      if (was) await tx.payStage.update({ where: { id: was.id }, data: { name: s.name, percent: s.percent, sort } });
      else await tx.payStage.create({ data: { ...(s.id && { id: s.id }), companyId: m.companyId, projectId: input.projectId, name: s.name, percent: s.percent, sort, createdById: m.id } });
    }
    await audit(tx, { me: m, ip: req.ip }, { action: 'update', entityType: 'payPlan', entityId: input.projectId, before, after: input.stages });
  });
  res.json({ ok: true });
});

/** The owner marks a stage reached (or not): that share of every sold flat falls due, and the book keepers hear of it. */
accounts.post('/stages/:id/reached', allow('accounts', 'C'), async (req, res) => {
  const m = me(req);
  const { date } = body(z.object({ date: isoDateSchema.nullable() }), req);
  await write(m.companyId, async (tx) => {
    const before = await tx.payStage.findFirst({ where: { id: param(req), companyId: m.companyId, deletedAt: null } });
    if (!before) throw new HttpError(404, 'Not found', 'not_found');
    siteParam(m, before.projectId);
    const after = await tx.payStage.update({ where: { id: before.id }, data: { reachedOn: date ? day(date) : null } });
    await audit(tx, { me: m, ip: req.ip }, { action: 'update', entityType: 'payStage', entityId: before.id, before, after });
    if (date && !before.reachedOn) {
      const site = await tx.project.findUnique({ where: { id: before.projectId }, select: { name: true } });
      await tell(tx, m, { key: 'notify.stageReached', vars: { stage: before.name, site: site?.name ?? '' } }, before.id);
    }
  });
  res.json({ ok: true });
});
