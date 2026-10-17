// Shared by the integration tests. Each test file makes its own company with random phone numbers.
process.env.OTP_DEV_CODE ??= '123456';

import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Role } from '@site-diary/shared';
import { createApp } from './app';
import { prisma, transaction } from './lib/prisma';
import { createCompany } from './modules/company/setup';

export const uuid = randomUUID;
export const phone = () => `+919${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

let server: Server | undefined;
let base_ = '';
export async function start() {
  server = createApp().listen(0);
  base_ = `http://localhost:${(server.address() as AddressInfo).port}/api/v1`;
}
export const base = () => baseUrl();
const baseUrl = () => base_;
export async function stop() {
  server?.close();
  await prisma.$disconnect();
}

export interface Client {
  token: string;
  refresh: string;
  deviceId: string;
  userId: string;
  call<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }>;
}

export async function call<T = unknown>(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; body: T }> {
  const res = await fetch(base_ + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-client': 'mobile', ...(token && { authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

export async function signIn(phoneNo: string, deviceId = `test-${uuid()}`): Promise<Client> {
  const r = await call<{ accessToken: string; refreshToken: string; user: { id: string } }>('POST', '/auth/otp/verify', { phone: phoneNo, code: '123456', deviceId });
  if (r.status !== 200) throw new Error(`sign in failed: ${JSON.stringify(r.body)}`);
  const c: Client = {
    token: r.body.accessToken,
    refresh: r.body.refreshToken,
    deviceId,
    userId: r.body.user.id,
    call: (method, path, body) => call(method, path, body, c.token),
  };
  return c;
}

/** Company with two sites, one person per role (field roles on site A only), and basic masters. */
export async function world() {
  const ownerPhone = phone();
  const { company, owner } = await transaction((tx) => createCompany(tx, { name: `Test ${uuid().slice(0, 6)}`, ownerName: 'Owner', phone: ownerPhone }));
  const companyId = company.id;
  const siteA = await prisma.project.create({ data: { companyId, name: 'Site A', type: 'rcc_frame' } });
  const siteB = await prisma.project.create({ data: { companyId, name: 'Site B', type: 'rcc_frame' } });
  const people: Record<Role, string> = { owner: ownerPhone, engineer: phone(), supervisor: phone(), store: phone(), accountant: phone() };
  for (const role of ['engineer', 'supervisor', 'store', 'accountant'] as const) {
    const u = await prisma.user.create({ data: { companyId, name: role, phone: people[role], role } });
    if (role !== 'accountant') await prisma.userSite.create({ data: { companyId, userId: u.id, projectId: siteA.id } });
  }
  const contractor = await prisma.contractor.create({ data: { companyId, name: 'Contractor' } });
  const skills = await prisma.skill.findMany({ where: { companyId }, orderBy: { sort: 'asc' } });
  const materials = await prisma.material.findMany({ where: { companyId } });
  const cement = materials.find((m) => m.nameEn === 'Cement')!;
  return { companyId, owner, siteA, siteB, people, contractor, kadiya: skills[0]!, majur: skills[1]!, cement };
}
