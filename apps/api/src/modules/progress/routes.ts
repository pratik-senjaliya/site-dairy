import { isoDateSchema, uuidSchema } from '@site-diary/shared';
import { Router } from 'express';
import { z } from 'zod';
import { allow, assertSite, me, siteWhere } from '../../lib/auth';
import { day } from '../../lib/json';
import { prisma } from '../../lib/prisma';
import { query } from '../../lib/validate';
import { stockFor } from '../store/ledger';

// Office registers (W4, W8, W9): read-only views over what sites entered. Changes go through /sync/push.
export const registers = Router();

const range = z.object({ projectId: uuidSchema, from: isoDateSchema, to: isoDateSchema });
const site = z.object({ projectId: uuidSchema });

registers.get('/attendance', allow('attendance', 'V'), async (req, res) => {
  const q = query(range, req);
  assertSite(me(req), q.projectId);
  res.json(
    await prisma.attendanceEntry.findMany({
      where: { projectId: q.projectId, deletedAt: null, date: { gte: day(q.from), lte: day(q.to) } },
      orderBy: [{ date: 'asc' }],
    }),
  );
});

registers.get('/grns', allow('store', 'V'), async (req, res) => {
  const q = query(range, req);
  assertSite(me(req), q.projectId);
  const grns = await prisma.grn.findMany({
    where: { projectId: q.projectId, deletedAt: null, date: { gte: day(q.from), lte: day(q.to) } },
    include: { lines: { where: { deletedAt: null } } },
    orderBy: { date: 'desc' },
  });
  const photos = await prisma.photo.findMany({ where: { sourceType: 'grn', sourceId: { in: grns.map((g) => g.id) }, deletedAt: null } });
  res.json(grns.map((g) => ({ ...g, photos: photos.filter((p) => p.sourceId === g.id) })));
});

registers.get('/material-issues', allow('store', 'V'), async (req, res) => {
  const q = query(range, req);
  assertSite(me(req), q.projectId);
  res.json(await prisma.materialIssue.findMany({ where: { projectId: q.projectId, deletedAt: null, date: { gte: day(q.from), lte: day(q.to) } }, orderBy: { date: 'desc' } }));
});

registers.get('/stock', allow('store', 'V'), async (req, res) => {
  const m = me(req);
  const q = query(site, req);
  assertSite(m, q.projectId);
  const [stock, settings] = await Promise.all([
    stockFor(prisma, m.companyId, [q.projectId]),
    prisma.siteMaterialSetting.findMany({ where: { projectId: q.projectId, deletedAt: null } }),
  ]);
  const ids = new Set([...stock.map((s) => s.materialId), ...settings.map((s) => s.materialId)]);
  res.json(
    [...ids].map((materialId) => ({
      materialId,
      qty: stock.find((s) => s.materialId === materialId)?.qty ?? 0,
      minStock: settings.find((s) => s.materialId === materialId)?.minStock.toNumber() ?? null,
      settingId: settings.find((s) => s.materialId === materialId)?.id ?? null,
    })),
  );
});

registers.get('/ledger', allow('store', 'V'), async (req, res) => {
  const q = query(site.extend({ materialId: uuidSchema }), req);
  assertSite(me(req), q.projectId);
  const rows = await prisma.stockLedger.findMany({ where: { projectId: q.projectId, materialId: q.materialId }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] });
  let balance = 0;
  res.json(rows.map((r) => ({ ...r, balance: Math.round((balance += r.qtyDelta.toNumber()) * 1000) / 1000 })));
});

registers.get('/transfers', allow('store', 'V'), async (req, res) => {
  const m = me(req);
  const sites = m.sites === 'all' ? undefined : m.sites;
  res.json(
    await prisma.stockTransfer.findMany({
      where: { companyId: m.companyId, deletedAt: null, ...(sites && { OR: [{ fromProjectId: { in: sites } }, { toProjectId: { in: sites } }] }) },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
  );
});

/** Latest % per floor × work item (W9). */
registers.get('/progress-grid', allow('progress', 'V'), async (req, res) => {
  const q = query(site, req);
  assertSite(me(req), q.projectId);
  const rows = await prisma.dailyProgress.findMany({ where: { projectId: q.projectId, deletedAt: null }, orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }] });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const key = `${r.structureNodeId ?? ''}:${r.workItemId}`;
    if (!latest.has(key)) latest.set(key, r);
  }
  res.json([...latest.values()].map((r) => ({ structureNodeId: r.structureNodeId, workItemId: r.workItemId, percent: r.percent, date: r.date })));
});

registers.get('/progress', allow('progress', 'V'), async (req, res) => {
  const q = query(range, req);
  assertSite(me(req), q.projectId);
  res.json(await prisma.dailyProgress.findMany({ where: { projectId: q.projectId, deletedAt: null, date: { gte: day(q.from), lte: day(q.to) } }, orderBy: { date: 'desc' } }));
});

registers.get('/photos', async (req, res) => {
  const q = query(range.extend({ sourceType: z.string().optional() }), req);
  assertSite(me(req), q.projectId);
  res.json(
    await prisma.photo.findMany({
      where: {
        projectId: q.projectId, deletedAt: null, ...(q.sourceType && { sourceType: q.sourceType }),
        takenAt: { gte: new Date(`${q.from}T00:00:00+05:30`), lt: new Date(new Date(`${q.to}T00:00:00+05:30`).getTime() + 86_400_000) },
      },
      orderBy: { takenAt: 'desc' },
      take: 500,
    }),
  );
});

registers.get('/issues', async (req, res) => {
  const m = me(req);
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  if (projectId) assertSite(m, projectId);
  res.json(
    await prisma.issue.findMany({
      where: { companyId: m.companyId, deletedAt: null, ...siteWhere(m), ...(projectId && { projectId }), ...(req.query.status === 'open' && { status: 'open' }) },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
  );
});
