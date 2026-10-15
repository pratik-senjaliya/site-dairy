import { isoDate } from '@site-diary/shared';
import { Router } from 'express';
import { prisma } from './lib/prisma';

export const v1 = Router();

v1.get('/health', async (_req, res) => {
  let database: 'up' | 'down' = 'up';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'down';
  }
  res.status(database === 'up' ? 200 : 503).json({ status: database === 'up' ? 'ok' : 'degraded', database, today: isoDate() });
});
