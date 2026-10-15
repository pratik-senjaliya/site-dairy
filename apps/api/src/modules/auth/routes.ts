import { LANGUAGES, parseSettings, phoneSchema } from '@site-diary/shared';
import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import {
  REFRESH_COOKIE, authenticate, clearCookies, isMobile, me, newOtp, refreshSession, sha256, startSession,
} from '../../lib/auth';
import { config } from '../../lib/config';
import { HttpError } from '../../lib/errors';
import { sendOtp } from '../../lib/otp';
import { prisma } from '../../lib/prisma';
import { body } from '../../lib/validate';
import { createCompany } from '../company/setup';

export const auth = Router();

const OTP_TTL_MS = 10 * 60_000;
const MAX_REQUESTS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

const device = { deviceId: z.string().min(8).max(100), deviceName: z.string().max(100).optional() };

auth.post('/otp/request', async (req, res) => {
  const { phone } = body(z.object({ phone: phoneSchema }), req);
  const recent = await prisma.otpCode.count({ where: { phone, createdAt: { gt: new Date(Date.now() - 3600_000) } } });
  // The hourly cap protects SMS cost and stops number-bombing; the dev provider sends no SMS.
  if (recent >= MAX_REQUESTS_PER_HOUR && config.otpProvider !== 'dev') throw new HttpError(429, 'Too many codes requested. Try again in an hour.', 'otp_limit');
  const code = newOtp();
  await prisma.otpCode.create({ data: { phone, codeHash: sha256(`${phone}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS) } });
  await sendOtp(phone, code);
  res.json({ sent: true, devHint: config.otpProvider === 'dev' ? 'Code is in the API log' : undefined });
});

/** A short token proving this phone number passed OTP; used to pick a company or sign up. */
const signVerified = (phone: string) => jwt.sign({ phone, kind: 'verified' }, config.jwtSecret, { expiresIn: '15m' });
function readVerified(token: string): string {
  try {
    const c = jwt.verify(token, config.jwtSecret) as { phone?: string; kind?: string };
    if (c.kind === 'verified' && c.phone) return c.phone;
  } catch {
    // fall through
  }
  throw new HttpError(401, 'Your code has expired. Please ask for a new one.', 'otp_expired');
}

async function checkCode(phone: string, code: string) {
  if (config.otpProvider === 'dev' && config.otpDevCode && code === config.otpDevCode) return;
  const otp = await prisma.otpCode.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.attempts >= MAX_ATTEMPTS) throw new HttpError(400, 'This code has expired. Please ask for a new one.', 'otp_expired');
  if (otp.codeHash !== sha256(`${phone}:${code}`)) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new HttpError(400, 'Wrong code. Please check the SMS and try again.', 'otp_wrong');
  }
  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
}

async function login(req: Request, res: Response, userId: string, deviceId: string, deviceName?: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const tokens = await startSession(req, res, user.id, user.companyId, deviceId, deviceName);
  await prisma.$transaction((tx) =>
    audit(tx, { me: { id: user.id, companyId: user.companyId, deviceId }, ip: req.ip }, { action: 'login', entityType: 'user', entityId: user.id }),
  );
  return { ...tokens, user: { id: user.id, name: user.name, role: user.role, companyId: user.companyId } };
}

auth.post('/otp/verify', async (req, res) => {
  const input = body(z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'), ...device }), req);
  await checkCode(input.phone, input.code);
  const users = await prisma.user.findMany({
    where: { phone: input.phone, isActive: true, deletedAt: null, company: { deletedAt: null } },
    include: { company: { select: { id: true, name: true } } },
  });
  if (users.length === 1) {
    res.json(await login(req, res, users[0]!.id, input.deviceId, input.deviceName));
    return;
  }
  const verifiedToken = signVerified(input.phone);
  if (!users.length) {
    if (!config.signupOpen) throw new HttpError(403, 'This number has no login. Ask your site owner to add you.', 'no_account');
    res.json({ signup: true, verifiedToken });
    return;
  }
  res.json({ verifiedToken, companies: users.map((u) => ({ id: u.company.id, name: u.company.name, role: u.role })) });
});

auth.post('/login', async (req, res) => {
  const input = body(z.object({ verifiedToken: z.string(), companyId: z.string().uuid(), ...device }), req);
  const phone = readVerified(input.verifiedToken);
  const user = await prisma.user.findFirst({ where: { phone, companyId: input.companyId, isActive: true, deletedAt: null } });
  if (!user) throw new HttpError(403, 'No login for this company', 'no_account');
  res.json(await login(req, res, user.id, input.deviceId, input.deviceName));
});

auth.post('/signup', async (req, res) => {
  if (!config.signupOpen) throw new HttpError(403, 'Sign-up is closed', 'signup_closed');
  const input = body(
    z.object({
      verifiedToken: z.string(),
      companyName: z.string().trim().min(2).max(120),
      name: z.string().trim().min(2).max(80),
      language: z.enum(LANGUAGES).default('gu'),
      ...device,
    }),
    req,
  );
  const phone = readVerified(input.verifiedToken);
  const { owner } = await prisma.$transaction((tx) => createCompany(tx, { name: input.companyName, ownerName: input.name, phone, language: input.language }));
  res.status(201).json(await login(req, res, owner.id, input.deviceId, input.deviceName));
});

auth.post('/refresh', async (req, res) => {
  const input = body(z.object({ refreshToken: z.string().optional(), deviceId: z.string().optional() }), req);
  const token = input.refreshToken ?? (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  if (!token) throw new HttpError(401, 'Please sign in', 'unauthenticated');
  res.json(await refreshSession(req, res, token, isMobile(req) ? input.deviceId : undefined));
});

auth.post('/logout', authenticate, async (req, res) => {
  await prisma.session.update({ where: { id: me(req).sessionId }, data: { revokedAt: new Date() } });
  await prisma.pushToken.deleteMany({ where: { userId: me(req).id, deviceId: me(req).deviceId } });
  clearCookies(res);
  res.json({ ok: true });
});

auth.get('/me', authenticate, async (req, res) => {
  const m = me(req);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: m.companyId } });
  const projects = await prisma.project.findMany({
    where: { companyId: m.companyId, deletedAt: null, ...(m.sites !== 'all' && { id: { in: m.sites } }) },
    select: { id: true, name: true, status: true },
    orderBy: { name: 'asc' },
  });
  res.json({
    user: { id: m.id, name: m.name, phone: m.phone, role: m.role, language: m.language },
    company: { id: company.id, name: company.name, plan: company.plan, settings: parseSettings(company.settings) },
    projects,
  });
});

auth.patch('/me', authenticate, async (req, res) => {
  const input = body(z.object({ name: z.string().trim().min(2).max(80).optional(), language: z.enum(LANGUAGES).optional() }), req);
  const m = me(req);
  const before = await prisma.user.findUniqueOrThrow({ where: { id: m.id } });
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id: m.id }, data: input });
    await audit(tx, { me: m, ip: req.ip }, { action: 'update', entityType: 'user', entityId: m.id, before: { name: before.name, language: before.language }, after: input });
    return u;
  });
  res.json({ id: user.id, name: user.name, language: user.language });
});

auth.post('/push-token', authenticate, async (req, res) => {
  const { token } = body(z.object({ token: z.string().min(10).max(300) }), req);
  const m = me(req);
  await prisma.pushToken.upsert({
    where: { userId_deviceId: { userId: m.id, deviceId: m.deviceId } },
    create: { userId: m.id, deviceId: m.deviceId, token },
    update: { token },
  });
  res.json({ ok: true });
});
