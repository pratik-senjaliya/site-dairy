import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { addDays, isoDate, rupeesToPaise } from '@site-diary/shared';
import { prisma } from './lib/prisma';
import { tick } from './jobs';
import { runNightlyFor } from './modules/reports/nightly';
import { call, signIn, start, stop, uuid, world } from './testUtils';

before(start);
after(stop);
const today = isoDate();

test('wages: settlement = attendance × rate in force − unsettled advances; owner approves; then paid', async () => {
  const w = await world();
  const eng = await signIn(w.people.engineer);
  await eng.call('POST', '/masters/contractorRate', { contractorId: w.contractor.id, skillId: w.kadiya.id, dailyRatePaise: rupeesToPaise(900), effectiveFrom: addDays(today, -30) });
  const sup = await signIn(w.people.supervisor);
  const d1 = addDays(today, -1);
  await sup.call('POST', '/sync/push', {
    changes: {
      attendanceEntry: [
        { id: uuid(), projectId: w.siteA.id, date: today, contractorId: w.contractor.id, skillId: w.kadiya.id, count: 4, halfDayCount: 2, otHours: 0 },
        { id: uuid(), projectId: w.siteA.id, date: d1, recordedOn: d1, contractorId: w.contractor.id, skillId: w.kadiya.id, count: 5, halfDayCount: 0, otHours: 8 },
      ],
      advance: [{ id: uuid(), projectId: w.siteA.id, contractorId: w.contractor.id, amountPaise: rupeesToPaise(2000), date: today, mode: 'cash' }],
    },
  });
  const preview = await eng.call<{ gross: number; net: number; manDays: number }>('GET', `/wages/preview?projectId=${w.siteA.id}&contractorId=${w.contractor.id}&from=${d1}&to=${today}`);
  // 5 days + 8h OT (= 1 day) + 4 days + 2 half days (= 1 day) = 11 days × ₹900
  assert.equal(preview.body.manDays, 10);
  assert.equal(preview.body.gross, rupeesToPaise(9900));
  assert.equal(preview.body.net, rupeesToPaise(7900));

  const s = await eng.call<{ id: string; status: string }>('POST', '/wages', { projectId: w.siteA.id, contractorId: w.contractor.id, from: d1, to: today });
  assert.equal(s.body.status, 'submitted');
  assert.equal((await eng.call('POST', '/wages', { projectId: w.siteA.id, contractorId: w.contractor.id, from: today, to: today })).status, 409, 'no overlapping settlement');
  assert.equal((await eng.call('POST', `/wages/${s.body.id}/pay`, { mode: 'upi' })).status, 409, 'must be approved first');
  const owner = await signIn(w.people.owner);
  const pending = await owner.call<{ id: string; entityId: string }[]>('GET', '/approvals?status=pending');
  await owner.call('POST', `/approvals/${pending.body.find((a) => a.entityId === s.body.id)!.id}/decide`, { decision: 'approve' });
  const paid = await eng.call<{ status: string }>('POST', `/wages/${s.body.id}/pay`, { mode: 'upi' });
  assert.equal(paid.body.status, 'paid');
  const again = await eng.call<{ advances: number }>('GET', `/wages/preview?projectId=${w.siteA.id}&contractorId=${w.contractor.id}&from=${today}&to=${today}`);
  assert.equal(again.body.advances, 0, 'advance is settled once');
});

test('purchase order above the owner threshold waits for the owner', async () => {
  const w = await world();
  const store = await signIn(w.people.store);
  const supplier = await store.call<{ id: string }>('POST', '/masters/supplier', { name: 'Umiya Traders', gstin: '' });
  const small = await store.call<{ status: string }>('POST', '/purchase/pos', { projectId: w.siteA.id, supplierId: supplier.body.id, lines: [{ materialId: w.cement.id, qty: 100, ratePaise: rupeesToPaise(380) }] });
  assert.equal(small.body.status, 'approved', '₹38,000 is under ₹50,000');
  const big = await store.call<{ status: string; poNo: string }>('POST', '/purchase/pos', { projectId: w.siteA.id, supplierId: supplier.body.id, lines: [{ materialId: w.cement.id, qty: 200, ratePaise: rupeesToPaise(380) }] });
  assert.equal(big.body.status, 'pending_approval');
  assert.match(big.body.poNo, /^PO-\d{4}-0002$/);
  const eng = await signIn(w.people.engineer);
  assert.ok(!(await eng.call<{ entityType: string }[]>('GET', '/approvals?status=pending')).body.some((a) => a.entityType === 'purchaseOrder'), 'engineers do not approve POs');
});

test('reports: PDF and Excel render (Gujarati daily report), office reports are role-gated', async () => {
  const w = await world();
  const sup = await signIn(w.people.supervisor);
  await sup.call('POST', '/sync/push', {
    changes: { attendanceEntry: [{ id: uuid(), projectId: w.siteA.id, date: today, contractorId: w.contractor.id, skillId: w.kadiya.id, count: 7, halfDayCount: 0, otHours: 0 }] },
  });
  const daily = await sup.call<{ tables: { title: string }[] }>('GET', `/reports/daily?projectId=${w.siteA.id}`);
  assert.equal(daily.status, 200);
  assert.match(daily.body.tables.map((t) => t.title).join('|'), /મજૂરી — 7 માણસ/);
  assert.equal((await sup.call('GET', `/reports/attendance?projectId=${w.siteA.id}`)).status, 403);

  const owner = await signIn(w.people.owner);
  for (const type of ['daily', 'attendance', 'wages', 'grn', 'stock', 'consumption', 'monthly']) {
    for (const format of ['pdf', 'xlsx']) {
      const res = await fetch(`http://localhost:${new URL((await import('./testUtils')).base()).port}/api/v1/reports/${type}?format=${format}`, { headers: { authorization: `Bearer ${owner.token}`, 'x-client': 'mobile' } });
      assert.equal(res.status, 200, `${type} ${format}`);
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf.subarray(0, 4).toString(), format === 'pdf' ? '%PDF' : 'PK\u0003\u0004', `${type} ${format}`);
    }
  }
});

test('nightly report: owner gets one per day with a public link; tick finds it due after report time', async () => {
  const w = await world();
  await prisma.company.update({ where: { id: w.companyId }, data: { settings: { reportTime: '00:00' } } });
  const due = await tick();
  assert.ok(due.some((d) => d.userId === w.owner.id));
  const row = await runNightlyFor(w.owner.id);
  assert.ok(row?.pdfKey);
  const token = (await signIn(w.people.owner)).call;
  const history = await token<{ link: string }[]>('GET', '/reports/nightly/history');
  const link = history.body[0]!.link;
  const pub = await call<{ title: string; company: string }>('GET', `/public/reports/${link.split('/r/')[1]}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.title, 'દૈનિક સાઇટ રિપોર્ટ');
  assert.equal((await call('GET', '/public/reports/not-a-token')).status, 404);
  const due2 = await tick();
  assert.ok(!due2.some((d) => d.userId === w.owner.id), 'not sent twice');
});

test('dashboard: missing entries and labour shown per site', async () => {
  const w = await world();
  const owner = await signIn(w.people.owner);
  const d = await owner.call<{ sites: { project: { id: string }; missing: string[] }[] }>('GET', '/dashboard');
  assert.equal(d.body.sites.length, 2);
  assert.ok(d.body.sites.every((s) => s.missing.includes('attendance')));
  const sup = await signIn(w.people.supervisor);
  const mine = await sup.call<{ sites: unknown[] }>('GET', '/dashboard');
  assert.equal(mine.body.sites.length, 1, 'scoped to assigned site');
});

test('every table with server_rev has the sync trigger', async () => {
  const missing = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT c.table_name FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'server_rev'
      AND NOT EXISTS (SELECT 1 FROM information_schema.triggers t WHERE t.event_object_table = c.table_name AND t.trigger_name = 'set_server_rev')`;
  assert.deepEqual(missing, []);
});
