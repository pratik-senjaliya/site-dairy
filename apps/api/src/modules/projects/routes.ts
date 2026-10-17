import { bulkFloorsSchema, projectSchema } from '@site-diary/shared';
import { Router } from 'express';
import { audit } from '../../lib/audit';
import { allow, assertSite, me } from '../../lib/auth';
import { write } from '../../lib/db';
import { HttpError } from '../../lib/errors';
import { day } from '../../lib/json';
import { assertSiteAllowed } from '../../lib/plan';
import { prisma } from '../../lib/prisma';
import { body, param } from '../../lib/validate';

export const projects = Router();

const toDb = (p: ReturnType<typeof projectSchema.parse>) => ({
  ...p,
  startDate: p.startDate ? day(p.startDate) : null,
  endDate: p.endDate ? day(p.endDate) : null,
  budgetPaise: p.budgetPaise == null ? null : BigInt(p.budgetPaise),
});

projects.get('/', async (req, res) => {
  const m = me(req);
  res.json(
    await prisma.project.findMany({
      where: { companyId: m.companyId, deletedAt: null, ...(m.sites !== 'all' && { id: { in: m.sites } }) },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    }),
  );
});

projects.get('/:id', async (req, res) => {
  const m = me(req);
  assertSite(m, param(req));
  const project = await prisma.project.findFirst({ where: { id: param(req), companyId: m.companyId, deletedAt: null } });
  if (!project) throw new HttpError(404, 'Site not found', 'not_found');
  const [structure, workItems, team] = await Promise.all([
    prisma.structureNode.findMany({ where: { projectId: project.id, deletedAt: null }, orderBy: [{ sort: 'asc' }, { name: 'asc' }] }),
    prisma.workItem.findMany({ where: { projectId: project.id, deletedAt: null }, orderBy: { sort: 'asc' } }),
    prisma.userSite.findMany({ where: { projectId: project.id, deletedAt: null }, include: { user: { select: { id: true, name: true, role: true, phone: true } } } }),
  ]);
  res.json({ ...project, structure, workItems, team: team.map((t) => t.user) });
});

// New site: work items come from the company's template for its type.
projects.post('/', allow('projects', 'C'), async (req, res) => {
  const m = me(req);
  const input = body(projectSchema, req);
  const project = await write(m.companyId, async (tx) => {
    if (input.status === 'active') await assertSiteAllowed(tx, m.companyId);
    const p = await tx.project.create({ data: { ...toDb(input), companyId: m.companyId, createdById: m.id } });
    const templates = await tx.workItemTemplate.findMany({ where: { companyId: m.companyId, projectType: input.type, deletedAt: null }, orderBy: { sort: 'asc' } });
    await tx.workItem.createMany({
      data: templates.map((t) => ({ companyId: m.companyId, projectId: p.id, templateId: t.id, nameGu: t.nameGu, nameEn: t.nameEn, sort: t.sort, createdById: m.id })),
    });
    await audit(tx, { me: m, ip: req.ip }, { action: 'create', entityType: 'project', entityId: p.id, after: p });
    return p;
  });
  res.status(201).json(project);
});

projects.patch('/:id', allow('projects', 'C'), async (req, res) => {
  const m = me(req);
  const input = body(projectSchema, req);
  const project = await write(m.companyId, async (tx) => {
    const before = await tx.project.findFirst({ where: { id: param(req), companyId: m.companyId, deletedAt: null } });
    if (!before) throw new HttpError(404, 'Site not found', 'not_found');
    if (input.status === 'active' && before.status !== 'active') await assertSiteAllowed(tx, m.companyId);
    const p = await tx.project.update({ where: { id: before.id }, data: toDb(input) });
    await audit(tx, { me: m, ip: req.ip }, { action: 'update', entityType: 'project', entityId: p.id, before, after: p });
    return p;
  });
  res.json(project);
});

// "B block, 12 floors": one tower with basements, ground and numbered floors in order.
projects.post('/:id/structure/bulk', allow('projects', 'C'), async (req, res) => {
  const m = me(req);
  const input = body(bulkFloorsSchema, req);
  const created = await write(m.companyId, async (tx) => {
    const project = await tx.project.findFirst({ where: { id: param(req), companyId: m.companyId, deletedAt: null } });
    if (!project) throw new HttpError(404, 'Site not found', 'not_found');
    const towers = await tx.structureNode.count({ where: { projectId: project.id, kind: 'tower', deletedAt: null } });
    const tower = await tx.structureNode.create({ data: { companyId: m.companyId, projectId: project.id, kind: 'tower', name: input.towerName, sort: towers, createdById: m.id } });
    const names = [
      ...Array.from({ length: input.basements }, (_, i) => `Basement ${input.basements - i}`),
      ...(input.ground ? ['Ground'] : []),
      ...Array.from({ length: input.floors }, (_, i) => `Floor ${i + 1}`),
    ];
    await tx.structureNode.createMany({
      data: names.map((name, sort) => ({ companyId: m.companyId, projectId: project.id, parentId: tower.id, kind: 'floor' as const, name, sort, createdById: m.id })),
    });
    await audit(tx, { me: m, ip: req.ip }, { action: 'create', entityType: 'structureNode', entityId: tower.id, after: { tower: input.towerName, floors: names } });
    return { tower, floors: names.length };
  });
  res.status(201).json(created);
});

projects.get('/meta/templates', async (req, res) => {
  const m = me(req);
  res.json(await prisma.workItemTemplate.findMany({ where: { companyId: m.companyId, deletedAt: null }, orderBy: [{ projectType: 'asc' }, { sort: 'asc' }] }));
});
