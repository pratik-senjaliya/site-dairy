import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { addDays, isoDate, rupeesToPaise, type PullResponse, type PushResult } from '@site-diary/shared';
import { prisma } from './lib/prisma';
import { reportLink } from './modules/reports/nightly';
import { call, signIn, start, stop, uuid, world } from './testUtils';

before(start);
after(stop);
const today = isoDate();

test('tokens: a report link or OTP token is never accepted as a sign-in', async () => {
  const w = await world();
  const row = await prisma.report.create({ data: { companyId: w.companyId, userId: w.owner.id, date: new Date(`${today}T00:00:00Z`), channel: 'in_app' } });
  const token = reportLink(row.id).split('/r/')[1]!;
  assert.equal((await call('GET', '/auth/me', undefined, token)).status, 401);
  const v = await call<{ verifiedToken: string }>('POST', '/auth/otp/verify', { phone: '+919811111111', code: '123456', deviceId: 'device-xyz' });
  assert.equal((await call('GET', '/auth/me', undefined, v.body.verifiedToken)).status, 401);
});

test('wages: attendance and advances inside a settlement are frozen until it is cancelled', async () => {
  const w = await world();
  const eng = await signIn(w.people.engineer);
  await eng.call('POST', '/masters/contractorRate', { contractorId: w.contractor.id, skillId: w.kadiya.id, dailyRatePaise: rupeesToPaise(900), effectiveFrom: addDays(today, -30) });
  const entry = { id: uuid(), projectId: w.siteA.id, date: today, contractorId: w.contractor.id, skillId: w.kadiya.id, count: 5, halfDayCount: 0, otHours: 0 };
  const adv = { id: uuid(), projectId: w.siteA.id, contractorId: w.contractor.id, amountPaise: 50000, date: today, mode: 'cash' };
  await eng.call('POST', '/sync/push', { changes: { attendanceEntry: [entry], advance: [adv] } });
  const s = await eng.call<{ id: string }>('POST', '/wages', { projectId: w.siteA.id, contractorId: w.contractor.id, from: today, to: today });
  const r = await eng.call<PushResult>('POST', '/sync/push', { changes: { attendanceEntry: [{ ...entry, count: 9 }], advance: [{ ...adv, amountPaise: 10 }] } });
  assert.equal(r.body.rejected.length, 2, JSON.stringify(r.body));
  assert.match(r.body.rejected[0]!.reason, /wage settlement/);
  await eng.call('POST', `/wages/${s.body.id}/cancel`);
  const ok = await eng.call<PushResult>('POST', '/sync/push', { changes: { attendanceEntry: [{ ...entry, count: 9 }] } });
  assert.equal(ok.body.applied, 1);
});

test('indent lines cannot change after approval; received transfers cannot be cancelled', async () => {
  const w = await world();
  const sup = await signIn(w.people.supervisor);
  const indentId = uuid();
  const line = { id: uuid(), indentId, materialId: w.cement.id, qty: 10 };
  await sup.call('POST', '/sync/push', { changes: { indent: [{ id: indentId, projectId: w.siteA.id, status: 'submitted' }], indentLine: [line] } });
  const owner = await signIn(w.people.owner);
  const a = (await owner.call<{ id: string; entityId: string }[]>('GET', '/approvals?status=pending')).body.find((x) => x.entityId === indentId)!;
  await owner.call('POST', `/approvals/${a.id}/decide`, { decision: 'approve' });
  const r = await sup.call<PushResult>('POST', '/sync/push', { changes: { indentLine: [{ ...line, qty: 500 }] } });
  assert.equal(r.body.rejected.length, 1);

  const storeUser = await prisma.user.findFirstOrThrow({ where: { phone: w.people.store } });
  await prisma.userSite.create({ data: { companyId: w.companyId, userId: storeUser.id, projectId: w.siteB.id } });
  const store = await signIn(w.people.store);
  const t = { id: uuid(), fromProjectId: w.siteA.id, toProjectId: w.siteB.id, materialId: w.cement.id, qty: 5, status: 'sent' };
  await store.call('POST', '/sync/push', { changes: { stockTransfer: [t] } });
  await store.call('POST', '/sync/push', { changes: { stockTransfer: [{ ...t, status: 'received' }] } });
  const c = await store.call<PushResult>('POST', '/sync/push', { changes: { stockTransfer: [{ ...t, status: 'cancelled' }] } });
  assert.equal(c.body.rejected.length, 1);
});

test('GRN against a PO marks it partly, then fully received', async () => {
  const w = await world();
  const store = await signIn(w.people.store);
  const supplier = await store.call<{ id: string }>('POST', '/masters/supplier', { name: 'S1' });
  const po = await store.call<{ id: string; status: string }>('POST', '/purchase/pos', { projectId: w.siteA.id, supplierId: supplier.body.id, lines: [{ materialId: w.cement.id, qty: 100, ratePaise: 30000 }] });
  assert.equal(po.body.status, 'approved');
  const grn = (qty: number) => {
    const id = uuid();
    return { grn: [{ id, projectId: w.siteA.id, poId: po.body.id, date: today }], grnLine: [{ id: uuid(), grnId: id, materialId: w.cement.id, qty, rejectedQty: 0 }] };
  };
  await store.call('POST', '/sync/push', { changes: grn(40) });
  assert.equal((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.body.id } })).status, 'partly_received');
  await store.call('POST', '/sync/push', { changes: grn(60) });
  assert.equal((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.body.id } })).status, 'received');
});

test('money and access: field roles cannot read rates; a removed site leaves the phone', async () => {
  const w = await world();
  const sup = await signIn(w.people.supervisor);
  assert.equal((await sup.call('GET', '/masters/contractorRate')).status, 403);
  assert.equal((await (await signIn(w.people.accountant)).call('GET', '/masters/contractorRate')).status, 200);
  const first = await sup.call<PullResponse>('GET', '/sync/pull');
  assert.deepEqual(first.body.sites, [w.siteA.id]);
  await prisma.userSite.updateMany({ where: { projectId: w.siteA.id, user: { phone: w.people.supervisor } }, data: { deletedAt: new Date() } });
  const next = await sup.call<PullResponse>('GET', `/sync/pull?since=${first.body.rev}`);
  assert.deepEqual(next.body.sites, []);
});
