import { isoDateSchema } from '@site-diary/shared';
import { Router } from 'express';
import { z } from 'zod';
import { allow, me } from '../../lib/auth';
import { prisma } from '../../lib/prisma';
import { query } from '../../lib/validate';

export const auditLog = Router();

// W13: owner only, newest first, 50 per page.
auditLog.get('/', allow('users', 'A'), async (req, res) => {
  const m = me(req);
  const q = query(
    z.object({
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      userId: z.string().uuid().optional(),
      from: isoDateSchema.optional(),
      to: isoDateSchema.optional(),
      page: z.coerce.number().int().min(1).default(1),
    }),
    req,
  );
  const where = {
    companyId: m.companyId,
    ...(q.entityType && { entityType: q.entityType }),
    ...(q.entityId && { entityId: q.entityId }),
    ...(q.userId && { userId: q.userId }),
    ...((q.from || q.to) && {
      at: { ...(q.from && { gte: new Date(`${q.from}T00:00:00+05:30`) }), ...(q.to && { lt: new Date(new Date(`${q.to}T00:00:00+05:30`).getTime() + 86_400_000) }) },
    }),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { at: 'desc' }, skip: (q.page - 1) * 50, take: 50 }),
    prisma.auditLog.count({ where }),
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId ?? '') } }, select: { id: true, name: true } });
  res.json({ total, rows: rows.map((r) => ({ ...r, user: users.find((u) => u.id === r.userId)?.name ?? null })) });
});
