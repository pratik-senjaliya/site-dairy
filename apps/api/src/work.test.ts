import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { addDays, isoDate, rupeesToPaise } from '@site-diary/shared';
import { prisma } from './lib/prisma';
import { signIn, start, stop, uuid, world } from './testUtils';

before(start);
after(stop);
const today = isoDate();

interface Work { works: { id: string; ratePaise: number | null }[]; measures: { id: string; qty: number; amountPaise: number | null; billed: boolean; by: string | null }[] }
interface Summary { contractors: { contractor: { id: string }; byDay: boolean; gross: number; advances: number; net: number; manDays: number; work: { name: string; qty: number; amount: number }[] }[] }

test('measured work: centering per sq ft is measured on site, billed with the upad, and frozen once billed', async () => {
  const w = await world();
  const owner = await signIn(w.people.owner);
  const engineer = await signIn(w.people.engineer);
  const sup = await signIn(w.people.supervisor);
  await prisma.contractor.update({ where: { id: w.contractor.id }, data: { rateType: 'per_unit', trade: 'Shuttering' } });

  // Rates are office work; the supervisor cannot set one.
  const body = { projectId: w.siteA.id, contractorId: w.contractor.id, name: 'Slab centering', unit: 'sqft', ratePaise: rupeesToPaise(22) };
  assert.equal((await sup.call('POST', '/work', body)).status, 403);
  const slab = await owner.call<{ id: string }>('POST', '/work', body);
  assert.equal(slab.status, 201);
  assert.equal((await owner.call('POST', '/work', { ...body, projectId: w.siteB.id, name: 'x' })).status, 201, 'owner sees every site');
  assert.equal((await engineer.call('POST', '/work', { ...body, projectId: w.siteB.id })).status, 403, 'engineer only on his sites');

  // The supervisor measures (and the men he marked present are only head count).
  const m1 = await sup.call<{ id: string }>('POST', '/work/measures', { id: uuid(), workId: slab.body.id, date: addDays(today, -1), qty: 2450, place: 'Floor 3' });
  assert.equal(m1.status, 201);
  assert.equal((await sup.call('POST', '/work/measures', { workId: slab.body.id, date: addDays(today, 1), qty: 10 })).status, 400, 'not in the future');
  await sup.call('POST', '/sync/push', { changes: {
    attendanceEntry: [{ id: uuid(), projectId: w.siteA.id, date: today, contractorId: w.contractor.id, skillId: w.kadiya.id, count: 8, halfDayCount: 0, otHours: 0 }],
    advance: [{ id: uuid(), projectId: w.siteA.id, contractorId: w.contractor.id, amountPaise: rupeesToPaise(20000), date: today, mode: 'cash' }],
  } });
  const told = await prisma.notification.findMany({ where: { companyId: w.companyId, kind: 'work' } });
  assert.equal(told.length, 1, 'the owner hears of the measurement');

  const seen = await sup.call<Work>('GET', `/work?projectId=${w.siteA.id}`);
  assert.equal(seen.body.works[0]?.ratePaise, null, 'the supervisor does not see rates');
  assert.equal(seen.body.measures[0]?.amountPaise, null);
  const office = await owner.call<Work>('GET', `/work?projectId=${w.siteA.id}`);
  assert.equal(office.body.measures[0]?.amountPaise, rupeesToPaise(53900));
  assert.equal(office.body.measures[0]?.by, 'supervisor');

  const sum = await owner.call<Summary>('GET', `/wages/summary?projectId=${w.siteA.id}&from=${addDays(today, -6)}&to=${today}`);
  const row = sum.body.contractors.find((c) => c.contractor.id === w.contractor.id)!;
  assert.equal(row.byDay, false);
  assert.equal(row.manDays, 8, 'head count still shown');
  assert.deepEqual(row.work.map((x) => [x.name, x.qty, x.amount]), [['Slab centering', 2450, rupeesToPaise(53900)]]);
  assert.equal(row.gross, rupeesToPaise(53900), 'attendance is not paid');
  assert.equal(row.net, rupeesToPaise(33900));

  // The engineer's bill waits for the owner; a rejection frees the measurement for the next bill.
  const bill = await engineer.call<{ id: string; status: string; grossPaise: string }>('POST', '/wages', { projectId: w.siteA.id, contractorId: w.contractor.id, from: addDays(today, -6), to: today });
  assert.equal(bill.status, 201);
  assert.equal(bill.body.status, 'submitted');
  assert.equal(Number(bill.body.grossPaise), rupeesToPaise(53900));
  const approval = await prisma.approval.findFirstOrThrow({ where: { entityId: bill.body.id } });
  const inbox = await owner.call<{ id: string; details: { work: { name: string; qty: number }[] } }[]>('GET', '/approvals?status=pending');
  assert.deepEqual(inbox.body.find((a) => a.id === approval.id)?.details.work.map((x) => [x.name, x.qty]), [['Slab centering', 2450]]);
  assert.equal((await sup.call('DELETE', `/work/measures/${m1.body.id}`)).status, 409, 'billed measurements stay');
  await owner.call('POST', `/approvals/${approval.id}/decide`, { decision: 'reject', reason: 'recheck' });
  assert.equal((await prisma.workMeasure.findUniqueOrThrow({ where: { id: m1.body.id } })).settlementId, null);

  const again = await owner.call<{ status: string; netPaise: string }>('POST', '/wages', { projectId: w.siteA.id, contractorId: w.contractor.id, from: addDays(today, -6), to: today });
  assert.equal(again.body.status, 'approved');
  assert.equal(Number(again.body.netPaise), rupeesToPaise(33900));
  assert.equal((await owner.call('DELETE', `/work/${slab.body.id}`)).status, 200, 'all billed, the work can go');
});

test('buyer instalments: a site plan, a stage reached, what each flat owes now', async () => {
  const w = await world();
  const owner = await signIn(w.people.owner);
  const partner = await signIn(w.people.partner);
  const flat = await owner.call<{ id: string }>('POST', '/accounts/units', { projectId: w.siteA.id, name: 'A-101', buyerName: 'Patel', dealPaise: rupeesToPaise(4000000) });
  await owner.call('POST', '/accounts/entries', { direction: 'in', kind: 'flat', unitId: flat.body.id, amountPaise: rupeesToPaise(300000), date: today, mode: 'cheque' });
  const plan = (ids: (string | undefined)[]) => ({ projectId: w.siteA.id, stages: [{ id: ids[0], name: 'Booking', percent: 10 }, { id: ids[1], name: 'Plinth', percent: 15 }, { id: ids[2], name: 'Slab 1', percent: 75 }] });
  assert.equal((await owner.call('PUT', '/accounts/stages', { projectId: w.siteA.id, stages: [{ name: 'A', percent: 80 }, { name: 'B', percent: 30 }] })).status, 400);
  assert.equal((await owner.call('PUT', '/accounts/stages', plan([]))).status, 200);
  type Book = { stages: { id: string; name: string; reachedOn: string | null }[]; units: { schedule: { dueNowPaise: number | null; duePaise: number } }[] };
  let book = await partner.call<Book>('GET', `/accounts?projectId=${w.siteA.id}`);
  assert.deepEqual(book.body.stages.map((s) => s.name), ['Booking', 'Plinth', 'Slab 1']);
  assert.equal(book.body.units[0]?.schedule.dueNowPaise, 0, 'nothing reached yet');

  const [booking, plinth] = book.body.stages;
  await owner.call('POST', `/accounts/stages/${booking!.id}/reached`, { date: today });
  assert.equal((await partner.call('POST', `/accounts/stages/${plinth!.id}/reached`, { date: today })).status, 200, 'partners keep the book too');
  book = await partner.call<Book>('GET', `/accounts?projectId=${w.siteA.id}`);
  assert.equal(book.body.units[0]?.schedule.duePaise, rupeesToPaise(1000000));
  assert.equal(book.body.units[0]?.schedule.dueNowPaise, rupeesToPaise(700000));
  assert.ok((await prisma.notification.findMany({ where: { companyId: w.companyId, userId: partner.userId } })).some((n) => n.title.includes('Booking')));

  // Saving the plan again keeps what was reached; a dropped stage goes.
  await owner.call('PUT', '/accounts/stages', { projectId: w.siteA.id, stages: [{ id: booking!.id, name: 'Booking', percent: 10 }, { id: plinth!.id, name: 'Plinth', percent: 90 }] });
  book = await partner.call<Book>('GET', `/accounts?projectId=${w.siteA.id}`);
  assert.deepEqual(book.body.stages.map((s) => [s.name, s.reachedOn]), [['Booking', today], ['Plinth', today]]);
  assert.equal((await (await signIn(w.people.engineer)).call('PUT', '/accounts/stages', plan([]))).status, 403);
});

test('parties: the last rate each party gave for a material', async () => {
  const w = await world();
  const owner = await signIn(w.people.owner);
  const store = await signIn(w.people.store);
  const [a, b] = await Promise.all(['Umiya', 'Patel'].map((name) => prisma.supplier.create({ data: { companyId: w.companyId, name } })));
  const grn = (supplierId: string, date: string, ratePaise: number) => {
    const id = uuid();
    return store.call('POST', '/sync/push', { changes: { grn: [{ id, projectId: w.siteA.id, supplierId, date }], grnLine: [{ id: uuid(), grnId: id, materialId: w.cement.id, qty: 100, rejectedQty: 0, ratePaise }] } });
  };
  await grn(a!.id, addDays(today, -5), 38000);
  await grn(a!.id, addDays(today, -1), 39000);
  await grn(b!.id, addDays(today, -3), 37500);
  const rows = await owner.call<{ supplierId: string; materialId: string; lastRatePaise: number | null; lastRateOn: string | null }[]>('GET', '/purchase/by-material');
  const of = (id: string) => rows.body.find((r) => r.supplierId === id && r.materialId === w.cement.id);
  assert.deepEqual([of(a!.id)?.lastRatePaise, of(a!.id)?.lastRateOn], [39000, addDays(today, -1)]);
  assert.equal(of(b!.id)?.lastRatePaise, 37500);
});
