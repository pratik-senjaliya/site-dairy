import { companySchema, companySettingsSchema, parseSettings, userSchema } from '@site-diary/shared';
import { Router } from 'express';
import { audit } from '../../lib/audit';
import { allow, me } from '../../lib/auth';
import { write, type Tx } from '../../lib/db';
import { HttpError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { body, param } from '../../lib/validate';

export const users = Router();

users.get('/', async (req, res) => {
  const m = me(req);
  const list = await prisma.user.findMany({
    where: { companyId: m.companyId, deletedAt: null },
    include: { sites: { where: { deletedAt: null }, select: { projectId: true } } },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  const sessions = await prisma.session.groupBy({ by: ['userId'], where: { userId: { in: list.map((u) => u.id) } }, _max: { lastUsedAt: true } });
  res.json(
    list.map(({ sites, ...u }) => ({
      ...u,
      siteIds: sites.map((s) => s.projectId),
      lastSeenAt: sessions.find((s) => s.userId === u.id)?._max.lastUsedAt ?? null,
    })),
  );
});

async function setSites(tx: Tx, companyId: string, userId: string, siteIds: string[], by: string) {
  const valid = await tx.project.findMany({ where: { companyId, id: { in: siteIds } }, select: { id: true } });
  if (valid.length !== new Set(siteIds).size) throw new HttpError(400, 'Unknown site', 'bad_site');
  const current = await tx.userSite.findMany({ where: { userId } });
  for (const s of current) {
    const keep = siteIds.includes(s.projectId);
    if (keep && s.deletedAt) await tx.userSite.update({ where: { id: s.id }, data: { deletedAt: null } });
    if (!keep && !s.deletedAt) await tx.userSite.update({ where: { id: s.id }, data: { deletedAt: new Date() } });
  }
  const missing = siteIds.filter((id) => !current.some((s) => s.projectId === id));
  await tx.userSite.createMany({ data: missing.map((projectId) => ({ companyId, userId, projectId, createdById: by })) });
}

// Invite by phone: the person signs in with OTP on that number.
users.post('/', allow('users', 'C'), async (req, res) => {
  const m = me(req);
  const { siteIds, ...input } = body(userSchema, req);
  const user = await write(m.companyId, async (tx) => {
    if (await tx.user.findFirst({ where: { companyId: m.companyId, phone: input.phone } })) throw new HttpError(409, 'This phone number already has a login', 'duplicate');
    const u = await tx.user.create({ data: { ...input, companyId: m.companyId, createdById: m.id } });
    await setSites(tx, m.companyId, u.id, siteIds, m.id);
    await audit(tx, { me: m, ip: req.ip }, { action: 'create', entityType: 'user', entityId: u.id, after: { ...u, siteIds } });
    return u;
  });
  res.status(201).json(user);
});

users.patch('/:id', allow('users', 'C'), async (req, res) => {
  const m = me(req);
  const { siteIds, ...input } = body(userSchema, req);
  const user = await write(m.companyId, async (tx) => {
    const before = await tx.user.findFirst({ where: { id: param(req), companyId: m.companyId, deletedAt: null }, include: { sites: true } });
    if (!before) throw new HttpError(404, 'Not found', 'not_found');
    if (before.id === m.id && (input.role !== 'owner' || !input.isActive)) throw new HttpError(400, 'You cannot remove your own owner access', 'self');
    const u = await tx.user.update({ where: { id: before.id }, data: input });
    await setSites(tx, m.companyId, u.id, siteIds, m.id);
    if (!input.isActive) await tx.session.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, { me: m, ip: req.ip }, { action: 'update', entityType: 'user', entityId: u.id, before, after: { ...u, siteIds } });
    return u;
  });
  res.json(user);
});

export const company = Router();

company.get('/', async (req, res) => {
  const c = await prisma.company.findUniqueOrThrow({ where: { id: me(req).companyId } });
  const [sites, people] = await Promise.all([
    prisma.project.count({ where: { companyId: c.id, deletedAt: null, status: 'active' } }),
    prisma.user.count({ where: { companyId: c.id, deletedAt: null, isActive: true } }),
  ]);
  res.json({ ...c, settings: parseSettings(c.settings), usage: { activeSites: sites, activeUsers: people } });
});

company.patch('/', allow('users', 'C'), async (req, res) => {
  const m = me(req);
  const input = body(companySchema.extend({ settings: companySettingsSchema }), req);
  const c = await write(m.companyId, async (tx) => {
    const before = await tx.company.findUniqueOrThrow({ where: { id: m.companyId } });
    const after = await tx.company.update({ where: { id: m.companyId }, data: { ...input, language: input.settings.language } });
    await audit(tx, { me: m, ip: req.ip }, { action: 'update', entityType: 'company', entityId: m.companyId, before, after });
    return after;
  });
  res.json({ ...c, settings: parseSettings(c.settings) });
});

