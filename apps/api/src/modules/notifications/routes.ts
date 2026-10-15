import { Router } from 'express';
import { z } from 'zod';
import { me } from '../../lib/auth';
import { prisma } from '../../lib/prisma';
import { body } from '../../lib/validate';

export const notifications = Router();

notifications.get('/', async (req, res) => {
  const m = me(req);
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: m.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.notification.count({ where: { userId: m.id, readAt: null } }),
  ]);
  res.json({ items, unread });
});

notifications.post('/read', async (req, res) => {
  const m = me(req);
  const { ids } = body(z.object({ ids: z.array(z.string().uuid()).optional() }), req);
  await prisma.notification.updateMany({ where: { userId: m.id, readAt: null, ...(ids && { id: { in: ids } }) }, data: { readAt: new Date() } });
  res.json({ ok: true });
});
