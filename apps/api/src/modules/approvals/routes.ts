import type { MessageKey } from '@site-diary/i18n';
import { can, type Module, type Role } from '@site-diary/shared';
import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { assertSite, me, siteOrCompanyWide, type Me } from '../../lib/auth';
import { write } from '../../lib/db';
import { HttpError } from '../../lib/errors';
import { notify } from '../../lib/notify';
import { prisma } from '../../lib/prisma';
import { body, param, query } from '../../lib/validate';
import { applyRow, companyProjects, finish, newCtx } from '../sync/push';

export const approvals = Router();

const DECIDES: Record<string, Module> = { attendanceEntry: 'attendance', indent: 'indent', purchaseOrder: 'po', wageSettlement: 'wages' };
const decidable = (role: Role) => Object.entries(DECIDES).filter(([, m]) => can(role, m, 'A')).map(([t]) => t);

/** What the approver needs to decide without opening anything else. */
async function describe(a: { entityType: string; entityId: string; proposal: unknown }) {
  switch (a.entityType) {
    case 'indent': {
      const indent = await prisma.indent.findUnique({ where: { id: a.entityId }, include: { lines: { where: { deletedAt: null } } } });
      const mats = await prisma.material.findMany({ where: { id: { in: indent?.lines.map((l) => l.materialId) ?? [] } } });
      return {
        neededBy: indent?.neededBy, note: indent?.note,
        lines: indent?.lines.map((l) => ({ material: mats.find((m) => m.id === l.materialId), qty: l.qty })) ?? [],
      };
    }
    case 'purchaseOrder': {
      const po = await prisma.purchaseOrder.findUnique({ where: { id: a.entityId }, include: { lines: { where: { deletedAt: null } } } });
      const supplier = po ? await prisma.supplier.findUnique({ where: { id: po.supplierId } }) : null;
      return { poNo: po?.poNo, totalPaise: po?.totalPaise, supplier: supplier?.name, lines: po?.lines.length ?? 0 };
    }
    case 'wageSettlement': {
      const w = await prisma.wageSettlement.findUnique({ where: { id: a.entityId } });
      const contractor = w ? await prisma.contractor.findUnique({ where: { id: w.contractorId } }) : null;
      return { contractor: contractor?.name, periodFrom: w?.periodFrom, periodTo: w?.periodTo, grossPaise: w?.grossPaise, advancesPaise: w?.advancesPaise, netPaise: w?.netPaise };
    }
    case 'attendanceEntry': {
      const current = await prisma.attendanceEntry.findUnique({ where: { id: a.entityId } });
      const p = (a.proposal ?? {}) as { contractorId?: string; skillId?: string };
      const [contractor, skill] = await Promise.all([
        p.contractorId ? prisma.contractor.findUnique({ where: { id: p.contractorId } }) : null,
        p.skillId ? prisma.skill.findUnique({ where: { id: p.skillId } }) : null,
      ]);
      return { current, proposed: a.proposal, contractor: contractor?.name, skill: skill?.nameGu };
    }
    default:
      return {};
  }
}

approvals.get('/', async (req, res) => {
  const m = me(req);
  const { status, mine } = query(z.object({ status: z.enum(['pending', 'approved', 'rejected', 'withdrawn']).optional(), mine: z.string().optional() }), req);
  const rows = await prisma.approval.findMany({
    where: {
      companyId: m.companyId, deletedAt: null, ...(status && { status }),
      ...(mine ? { requestedById: m.id } : { entityType: { in: decidable(m.role) }, ...siteOrCompanyWide(m) }),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const users = await prisma.user.findMany({ where: { id: { in: rows.flatMap((r) => [r.requestedById, r.decidedById ?? r.requestedById]) } }, select: { id: true, name: true } });
  const projects = await prisma.project.findMany({ where: { id: { in: rows.map((r) => r.projectId ?? '') } }, select: { id: true, name: true } });
  const name = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;
  res.json(
    await Promise.all(
      rows.map(async (r) => ({
        ...r,
        requestedBy: name(r.requestedById),
        decidedBy: name(r.decidedById),
        project: projects.find((p) => p.id === r.projectId)?.name ?? null,
        details: r.status === 'pending' ? await describe(r) : undefined,
      })),
    ),
  );
});

approvals.get('/count', async (req, res) => {
  const m = me(req);
  const count = await prisma.approval.count({
    where: { companyId: m.companyId, deletedAt: null, status: 'pending', entityType: { in: decidable(m.role) }, ...siteOrCompanyWide(m) },
  });
  res.json({ count });
});

export async function decide(m: Me, ip: string | null, id: string, decision: 'approve' | 'reject', reason?: string) {
  return write(m.companyId, async (tx) => {
    const a = await tx.approval.findUnique({ where: { id } });
    if (!a || a.companyId !== m.companyId || a.deletedAt) throw new HttpError(404, 'Not found', 'not_found');
    if (a.status !== 'pending') throw new HttpError(409, 'Already decided', 'decided');
    const module = DECIDES[a.entityType];
    if (!module || !can(m.role, module, 'A')) throw new HttpError(403, 'You cannot decide this', 'forbidden');
    if (a.projectId) assertSite(m, a.projectId);
    if (a.requestedById === m.id && m.role !== 'owner') throw new HttpError(403, 'Someone else has to approve your own request', 'self_approval');
    const approved = decision === 'approve';

    if (a.entityType === 'attendanceEntry' && approved) {
      const ctx = newCtx(m, ip, await companyProjects(tx, m.companyId), true);
      // Applied as the approver, recorded as approved; the original requester stays on the approval.
      await applyRow(tx, ctx, 'attendanceEntry', a.proposal as Record<string, unknown>);
      await finish(tx, ctx);
    } else if (a.entityType === 'indent') {
      await tx.indent.update({ where: { id: a.entityId }, data: { status: approved ? 'approved' : 'rejected', approvedById: m.id } });
    } else if (a.entityType === 'purchaseOrder') {
      await tx.purchaseOrder.update({ where: { id: a.entityId }, data: { status: approved ? 'approved' : 'rejected', approvedById: m.id } });
    } else if (a.entityType === 'wageSettlement') {
      await tx.wageSettlement.update({ where: { id: a.entityId }, data: { status: approved ? 'approved' : 'rejected', approvedById: m.id } });
      if (!approved) await tx.advance.updateMany({ where: { settlementId: a.entityId }, data: { settlementId: null } });
    }

    const updated = await tx.approval.update({
      where: { id }, data: { status: approved ? 'approved' : 'rejected', decidedById: m.id, decidedAt: new Date(), reason: reason ?? null },
    });
    await audit(tx, { me: m, ip }, { action: approved ? 'approve' : 'reject', entityType: a.entityType, entityId: a.entityId, before: a, after: updated });
    await notify(tx, m.companyId, [a.requestedById], {
      kind: approved ? 'approved' : 'rejected',
      title: { key: approved ? 'notify.approved' : 'notify.rejected', vars: { what: { key: `approval.${a.entityType}` as MessageKey } } },
      body: reason ? `${m.name}: ${reason}` : { key: 'notify.by', vars: { name: m.name } },
      entityType: 'approval',
      entityId: id,
    });
    return updated;
  });
}

approvals.post('/:id/decide', async (req, res) => {
  const input = body(z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(500).optional() }), req);
  if (input.decision === 'reject' && !input.reason) throw new HttpError(400, 'Please give a reason for rejecting', 'reason_needed');
  res.json(await decide(me(req), req.ip ?? null, param(req), input.decision, input.reason));
});

approvals.post('/:id/withdraw', async (req, res) => {
  const m = me(req);
  const updated = await write(m.companyId, async (tx) => {
    const a = await tx.approval.findUnique({ where: { id: param(req) } });
    if (!a || a.companyId !== m.companyId || a.requestedById !== m.id) throw new HttpError(404, 'Not found', 'not_found');
    if (a.status !== 'pending') throw new HttpError(409, 'Already decided', 'decided');
    const u = await tx.approval.update({ where: { id: a.id }, data: { status: 'withdrawn' } });
    if (a.entityType === 'indent') await tx.indent.update({ where: { id: a.entityId }, data: { status: 'draft' } });
    await audit(tx, { me: m, ip: req.ip }, { action: 'withdraw', entityType: 'approval', entityId: a.id, before: a, after: u });
    return u;
  });
  res.json(updated);
});
