import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { addDays, isoDate, type PullResponse, type PushResult } from '@site-diary/shared';
import { prisma } from './lib/prisma';
import { signIn, start, stop, uuid, world } from './testUtils';

before(start);
after(stop);

const today = isoDate();
const att = (w: Awaited<ReturnType<typeof world>>, extra: Record<string, unknown> = {}) => ({
  id: uuid(), projectId: w.siteA.id, date: today, contractorId: w.contractor.id, skillId: w.kadiya.id, count: 5, halfDayCount: 1, otHours: 2, ...extra,
});

test('site scoping: a supervisor pulls only assigned sites and cannot push to others', async () => {
  const w = await world();
  const sup = await signIn(w.people.supervisor);
  const p = await sup.call<PullResponse>('GET', '/sync/pull');
  assert.deepEqual(p.body.changes.project?.map((r) => r.id), [w.siteA.id]);
  const r = await sup.call<PushResult>('POST', '/sync/push', { changes: { attendanceEntry: [att(w, { projectId: w.siteB.id })] } });
  assert.equal(r.body.rejected.length, 1);
  assert.match(r.body.rejected[0]!.reason, /not assigned/);
});

test('tenant isolation: another company cannot write to this company’s site', async () => {
  const w = await world();
  const other = await world();
  const owner2 = await signIn(other.people.owner);
  const r = await owner2.call<PushResult>('POST', '/sync/push', { changes: { attendanceEntry: [att(w)] } });
  assert.equal(r.body.rejected.length, 1);
  assert.equal(await prisma.attendanceEntry.count({ where: { projectId: w.siteA.id } }), 0);
});

test('a builder without a supervisor makes the site entries himself', async () => {
  const w = await world();
  const owner = await signIn(w.people.owner);
  const issue = { id: uuid(), projectId: w.siteB.id, date: today, materialId: w.cement.id, qty: 10 };
  const r = await owner.call<PushResult>('POST', '/sync/push', { changes: { attendanceEntry: [att(w, { projectId: w.siteB.id })], materialIssue: [issue] } });
  assert.equal(r.body.applied, 2, JSON.stringify(r.body.rejected));
});

test('attendance: today applies; a late supervisor edit waits for engineer approval; offline catch-up allowed', async () => {
  const w = await world();
  const sup = await signIn(w.people.supervisor);
  const ok = await sup.call<PushResult>('POST', '/sync/push', { changes: { attendanceEntry: [att(w)] } });
  assert.equal(ok.body.applied, 1);

  const yesterday = addDays(today, -1);
  const offline = await sup.call<PushResult>('POST', '/sync/push', { changes: { attendanceEntry: [att(w, { date: yesterday, recordedOn: yesterday })] } });
  assert.equal(offline.body.applied, 1, 'entry made offline yesterday syncs today');

  const lateRow = att(w, { date: addDays(today, -2), skillId: w.majur.id, count: 9 });
  const late = await sup.call<PushResult>('POST', '/sync/push', { changes: { attendanceEntry: [lateRow] } });
  assert.deepEqual(late.body.pending, [lateRow.id]);
  assert.equal(await prisma.attendanceEntry.count({ where: { id: lateRow.id } }), 0);

  const eng = await signIn(w.people.engineer);
  const list = await eng.call<{ id: string; entityType: string }[]>('GET', '/approvals?status=pending');
  const approval = list.body.find((a) => a.entityType === 'attendanceEntry')!;
  assert.ok(approval, 'engineer sees the request');
  assert.equal((await sup.call('POST', `/approvals/${approval.id}/decide`, { decision: 'approve' })).status, 403, 'supervisor cannot approve');
  assert.equal((await eng.call('POST', `/approvals/${approval.id}/decide`, { decision: 'approve' })).status, 200);
  const row = await prisma.attendanceEntry.findUniqueOrThrow({ where: { id: lateRow.id } });
  assert.equal(row.count, 9);
  const notes = await prisma.notification.findMany({ where: { userId: sup.userId, kind: 'approved' } });
  assert.equal(notes.length, 1, 'requester told');
});

test('attendance: two phones entering the same contractor × skill × day merge into one row', async () => {
  const w = await world();
  const sup = await signIn(w.people.supervisor);
  const eng = await signIn(w.people.engineer);
  await sup.call('POST', '/sync/push', { changes: { attendanceEntry: [att(w, { count: 4 })] } });
  const second = att(w, { count: 6 });
  const r = await eng.call<PushResult>('POST', '/sync/push', { changes: { attendanceEntry: [second] } });
  assert.ok(r.body.remapped[second.id]);
  const rows = await prisma.attendanceEntry.findMany({ where: { projectId: w.siteA.id, date: new Date(`${today}T00:00:00Z`) } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.count, 6, 'last write wins');
});

test('stock = received (minus rejected) − issued ± transfers; low stock notifies the store', async () => {
  const w = await world();
  await prisma.siteMaterialSetting.create({ data: { companyId: w.companyId, projectId: w.siteA.id, materialId: w.cement.id, minStock: 50 } });
  await prisma.userSite.create({ data: { companyId: w.companyId, userId: (await prisma.user.findFirstOrThrow({ where: { phone: w.people.store } })).id, projectId: w.siteB.id } });
  const store = await signIn(w.people.store);
  const grnId = uuid();
  const r = await store.call<PushResult>('POST', '/sync/push', {
    changes: {
      grn: [{ id: grnId, projectId: w.siteA.id, date: today, challanNo: 'C-1' }],
      grnLine: [{ id: uuid(), grnId, materialId: w.cement.id, qty: 100, rejectedQty: 4 }],
      materialIssue: [{ id: uuid(), projectId: w.siteA.id, materialId: w.cement.id, qty: 30, date: today }],
      stockTransfer: [{ id: uuid(), fromProjectId: w.siteA.id, toProjectId: w.siteB.id, materialId: w.cement.id, qty: 20, status: 'sent' }],
    },
  });
  assert.equal(r.body.applied, 4, JSON.stringify(r.body.rejected));
  const p = await store.call<PullResponse>('GET', '/sync/pull');
  const stockA = p.body.stock.find((s) => s.projectId === w.siteA.id && s.materialId === w.cement.id);
  assert.equal(stockA?.qty, 46);
  assert.equal(p.body.stock.find((s) => s.projectId === w.siteB.id)?.qty ?? 0, 0, 'not received yet');
  const low = await prisma.notification.findMany({ where: { userId: store.userId, kind: 'low_stock' } });
  assert.equal(low.length, 1);

  // Editing the GRN line rebuilds its ledger rows.
  const line = await prisma.grnLine.findFirstOrThrow({ where: { grnId } });
  await store.call('POST', '/sync/push', { changes: { grnLine: [{ id: line.id, grnId, materialId: w.cement.id, qty: 120, rejectedQty: 0 }] } });
  const p2 = await store.call<PullResponse>('GET', '/sync/pull');
  assert.equal(p2.body.stock.find((s) => s.projectId === w.siteA.id)?.qty, 70);
});

test('pull is incremental: the second pull returns only what changed', async () => {
  const w = await world();
  const sup = await signIn(w.people.supervisor);
  const first = await sup.call<PullResponse>('GET', '/sync/pull');
  const again = await sup.call<PullResponse>('GET', `/sync/pull?since=${first.body.rev}`);
  assert.deepEqual(again.body.changes, {});
  await sup.call('POST', '/sync/push', { changes: { attendanceEntry: [att(w)] } });
  const next = await sup.call<PullResponse>('GET', `/sync/pull?since=${first.body.rev}`);
  assert.deepEqual(Object.keys(next.body.changes), ['attendanceEntry']);
});

test('indent: submitted from site, approved by engineer', async () => {
  const w = await world();
  const sup = await signIn(w.people.supervisor);
  const indentId = uuid();
  await sup.call('POST', '/sync/push', {
    changes: { indent: [{ id: indentId, projectId: w.siteA.id, status: 'submitted' }], indentLine: [{ id: uuid(), indentId, materialId: w.cement.id, qty: 200 }] },
  });
  const eng = await signIn(w.people.engineer);
  const pending = await eng.call<{ id: string; entityId: string }[]>('GET', '/approvals?status=pending');
  const a = pending.body.find((x) => x.entityId === indentId)!;
  assert.equal((await eng.call('POST', `/approvals/${a.id}/decide`, { decision: 'reject' })).status, 400, 'reason needed');
  await eng.call('POST', `/approvals/${a.id}/decide`, { decision: 'approve' });
  assert.equal((await prisma.indent.findUniqueOrThrow({ where: { id: indentId } })).status, 'approved');
});
