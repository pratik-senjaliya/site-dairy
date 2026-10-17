import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { Language } from '@prisma/client';
import { can, seesAllSites, type Action, type Module, type Role } from '@site-diary/shared';
import type { Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Actor } from './audit';
import { config } from './config';
import { requestContext } from './context';
import { HttpError } from './errors';
import { prisma } from './prisma';

export interface Me {
  id: string;
  companyId: string;
  name: string;
  phone: string;
  role: Role;
  language: Language;
  sessionId: string;
  deviceId: string;
  /** Project ids this user may see; 'all' for owner and accountant. */
  sites: string[] | 'all';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      me?: Me;
    }
  }
}

export const ACCESS_COOKIE = 'sd_access';
export const REFRESH_COOKIE = 'sd_refresh';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const newOtp = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

const cookieBase = { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure } as const;

/** Phones send X-Client: mobile and keep tokens in secure storage; the web panel uses httpOnly cookies. */
export const isMobile = (req: Request) => req.get('x-client') === 'mobile';

export function signAccess(userId: string, sessionId: string) {
  return jwt.sign({ sub: userId, sid: sessionId }, config.jwtSecret, { expiresIn: `${config.accessMinutes}m`, audience: 'access' });
}

/** Creates a device session and returns the tokens (sets cookies for the web panel). */
export async function startSession(req: Request, res: Response, userId: string, companyId: string, deviceId: string, deviceName?: string) {
  const refresh = randomBytes(32).toString('base64url');
  const session = await prisma.session.create({
    data: {
      userId, companyId, deviceId, deviceName,
      refreshHash: sha256(refresh),
      expiresAt: new Date(Date.now() + config.refreshDays * 86_400_000),
    },
  });
  return issue(req, res, userId, session.id, refresh);
}

export function issue(req: Request, res: Response, userId: string, sessionId: string, refresh: string) {
  const access = signAccess(userId, sessionId);
  if (!isMobile(req)) {
    res.cookie(ACCESS_COOKIE, access, { ...cookieBase, path: '/', maxAge: config.accessMinutes * 60_000 });
    res.cookie(REFRESH_COOKIE, refresh, { ...cookieBase, path: '/api/v1/auth', maxAge: config.refreshDays * 86_400_000 });
    return {};
  }
  return { accessToken: access, refreshToken: refresh };
}

export function clearCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...cookieBase, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase, path: '/api/v1/auth' });
}

/** Rotates a refresh token; refuses a token from another device or a revoked/expired session. */
export async function refreshSession(req: Request, res: Response, refresh: string, deviceId: string | undefined) {
  const session = await prisma.session.findUnique({ where: { refreshHash: sha256(refresh) } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) throw new HttpError(401, 'Please sign in again', 'session_ended');
  if (deviceId && deviceId !== session.deviceId) throw new HttpError(401, 'Please sign in again', 'session_ended');
  const next = randomBytes(32).toString('base64url');
  await prisma.session.update({
    where: { id: session.id },
    data: { refreshHash: sha256(next), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + config.refreshDays * 86_400_000) },
  });
  return issue(req, res, session.userId, session.id, next);
}

function tokenOf(req: Request): string | undefined {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
}

// The user, role and sites are read on every request, so a role change or a removed user takes effect at once.
export const authenticate: RequestHandler = async (req, _res, next) => {
  let claims: { sub: string; sid: string } | undefined;
  try {
    const token = tokenOf(req);
    // audience: a report link or an OTP-verified token can never be used as a sign-in.
    const c = token ? (jwt.verify(token, config.jwtSecret, { audience: 'access' }) as { sub?: unknown; sid?: unknown }) : null;
    if (c && typeof c.sub === 'string' && typeof c.sid === 'string') claims = { sub: c.sub, sid: c.sid };
  } catch {
    // expired or bad: 401 below; the client refreshes and retries
  }
  if (!claims) throw new HttpError(401, 'Please sign in', 'unauthenticated');
  const session = await prisma.session.findUnique({ where: { id: claims.sid } });
  if (!session || session.revokedAt || session.userId !== claims.sub) throw new HttpError(401, 'Please sign in again', 'session_ended');
  const user = await prisma.user.findUnique({ where: { id: claims.sub }, include: { sites: { where: { deletedAt: null } } } });
  if (!user || !user.isActive || user.deletedAt) throw new HttpError(401, 'This login is no longer active', 'session_ended');
  req.me = {
    id: user.id,
    companyId: user.companyId,
    name: user.name,
    phone: user.phone,
    role: user.role,
    language: user.language,
    sessionId: session.id,
    deviceId: session.deviceId,
    sites: seesAllSites(user.role) ? 'all' : user.sites.map((s) => s.projectId),
  };
  // From here on every query in this request is limited to this company by Postgres itself.
  requestContext.run({ companyId: user.companyId }, next);
};

export const me = (req: Request): Me => {
  if (!req.me) throw new HttpError(401, 'Please sign in', 'unauthenticated');
  return req.me;
};

export const actor = (req: Request): Actor => ({ me: me(req), ip: req.ip ?? null });

export const allow =
  (module: Module, ...actions: Action[]): RequestHandler =>
  (req, _res, next) => {
    const role = me(req).role;
    if (!actions.some((a) => can(role, module, a))) throw new HttpError(403, 'You do not have permission to do this', 'forbidden');
    next();
  };

export const allowRoles =
  (...roles: Me['role'][]): RequestHandler =>
  (req, _res, next) => {
    if (!roles.includes(me(req).role)) throw new HttpError(403, 'You do not have permission to do this', 'forbidden');
    next();
  };

export function assertCan(m: Me, module: Module, action: Action) {
  if (!can(m.role, module, action)) throw new HttpError(403, 'You do not have permission to do this', 'forbidden');
}

/** Spread into a Prisma where on any model with projectId. */
export function siteWhere(m: Me): { projectId?: { in: string[] } } {
  return m.sites === 'all' ? {} : { projectId: { in: m.sites } };
}

/** For rows that may belong to no site (projectId null): those plus this person's sites. */
export function siteOrCompanyWide(m: Me): { OR?: ({ projectId: null } | { projectId: { in: string[] } })[] } {
  return m.sites === 'all' ? {} : { OR: [{ projectId: null }, { projectId: { in: m.sites } }] };
}

export function assertSite(m: Me, projectId: string) {
  if (m.sites !== 'all' && !m.sites.includes(projectId)) throw new HttpError(403, 'This site is not assigned to you', 'forbidden_site');
}

/** Use a query parameter or body field ?projectId= and check it. */
export function siteParam(m: Me, value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  assertSite(m, value);
  return value;
}
