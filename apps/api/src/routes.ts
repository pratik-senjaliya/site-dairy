import { isoDate } from '@site-diary/shared';
import { Router } from 'express';
import { authenticate } from './lib/auth';
import { prisma } from './lib/prisma';
import { approvals } from './modules/approvals/routes';
import { auditLog } from './modules/audit/routes';
import { dashboard } from './modules/dashboard/routes';
import { registers } from './modules/progress/routes';
import { purchase } from './modules/purchase/routes';
import { publicReports } from './modules/reports/public';
import { reports } from './modules/reports/routes';
import { wages } from './modules/wages/routes';
import { auth } from './modules/auth/routes';
import { masters } from './modules/masters/routes';
import { notifications } from './modules/notifications/routes';
import { photos } from './modules/photos/routes';
import { projects } from './modules/projects/routes';
import { sync } from './modules/sync/routes';
import { company, users } from './modules/users/routes';

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

v1.use('/auth', auth);
v1.use('/public/reports', publicReports);

// Everything below needs a signed-in user.
v1.use(authenticate);
v1.use('/sync', sync);
v1.use('/approvals', approvals);
v1.use('/masters', masters);
v1.use('/projects', projects);
v1.use('/users', users);
v1.use('/company', company);
v1.use('/photos', photos);
v1.use('/notifications', notifications);
v1.use('/wages', wages);
v1.use('/purchase', purchase);
v1.use('/registers', registers);
v1.use('/dashboard', dashboard);
v1.use('/reports', reports);
v1.use('/audit', auditLog);
