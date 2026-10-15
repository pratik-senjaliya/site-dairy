import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import ExcelJS from 'exceljs';
import { isoDate, type PullResponse, type PushResult } from '@site-diary/shared';
import { prisma } from './lib/prisma';
import { base, signIn, start, stop, uuid, world } from './testUtils';

before(start);
after(stop);
const today = isoDate();

test('photos: row syncs first, file uploads after, only people on that site can see it', async () => {
  const w = await world();
  const sup = await signIn(w.people.supervisor);
  const photoId = uuid();
  await sup.call('POST', '/sync/push', { changes: { photo: [{ id: photoId, projectId: w.siteA.id, takenAt: new Date().toISOString(), lat: 23.05, lng: 72.66, sourceType: 'attendance', sourceId: uuid() }] } });
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
  const put = await fetch(`${base()}/photos/${photoId}/file`, { method: 'PUT', headers: { authorization: `Bearer ${sup.token}`, 'content-type': 'image/jpeg' }, body: jpeg });
  assert.equal(put.status, 200);
  assert.equal((await prisma.photo.findUniqueOrThrow({ where: { id: photoId } })).uploaded, true);
  const got = await fetch(`${base()}/photos/${photoId}/file`, { headers: { authorization: `Bearer ${sup.token}` } });
  assert.equal(got.status, 200);
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), jpeg);
  const other = await signIn((await world()).people.owner);
  assert.equal((await fetch(`${base()}/photos/${photoId}/file`, { headers: { authorization: `Bearer ${other.token}` } })).status, 404, 'other company');
});

test('transfer: only the receiving site can confirm it arrived; stock moves then', async () => {
  const w = await world();
  const storeA = await signIn(w.people.store);
  const engB = await prisma.user.create({ data: { companyId: w.companyId, name: 'B eng', phone: `+9197${String(Date.now()).slice(-8)}`, role: 'engineer' } });
  await prisma.userSite.create({ data: { companyId: w.companyId, userId: engB.id, projectId: w.siteB.id } });
  const grnId = uuid();
  const id = uuid();
  await storeA.call('POST', '/sync/push', {
    changes: {
      grn: [{ id: grnId, projectId: w.siteA.id, date: today }],
      grnLine: [{ id: uuid(), grnId, materialId: w.cement.id, qty: 100, rejectedQty: 0 }],
      stockTransfer: [{ id, fromProjectId: w.siteA.id, toProjectId: w.siteB.id, materialId: w.cement.id, qty: 30, status: 'sent' }],
    },
  });
  const selfReceive = await storeA.call<PushResult>('POST', '/sync/push', { changes: { stockTransfer: [{ id, fromProjectId: w.siteA.id, toProjectId: w.siteB.id, materialId: w.cement.id, qty: 30, status: 'received' }] } });
  assert.equal(selfReceive.body.rejected.length, 1, 'sending site cannot mark it received');
  // Engineers have no store "C"; give site B a store keeper.
  await prisma.user.update({ where: { id: engB.id }, data: { role: 'store' } });
  const b = await signIn(engB.phone);
  const ok = await b.call<PushResult>('POST', '/sync/push', { changes: { stockTransfer: [{ id, fromProjectId: w.siteA.id, toProjectId: w.siteB.id, materialId: w.cement.id, qty: 30, status: 'received' }] } });
  assert.equal(ok.body.applied, 1, JSON.stringify(ok.body.rejected));
  const p = await b.call<PullResponse>('GET', '/sync/pull');
  assert.equal(p.body.stock.find((s) => s.projectId === w.siteB.id)?.qty, 30);
  const owner = await signIn(w.people.owner);
  const all = await owner.call<PullResponse>('GET', '/sync/pull');
  assert.equal(all.body.stock.find((s) => s.projectId === w.siteA.id)?.qty, 70);
});

test('masters: another company cannot change or read this company’s lists', async () => {
  const w = await world();
  const other = await signIn((await world()).people.owner);
  assert.equal((await other.call('PATCH', `/masters/contractor/${w.contractor.id}`, { name: 'Hijacked', rateType: 'daily' })).status, 404);
  assert.equal((await other.call('DELETE', `/masters/contractor/${w.contractor.id}`)).status, 404);
  const list = await other.call<{ id: string }[]>('GET', '/masters/contractor');
  assert.ok(!list.body.some((c) => c.id === w.contractor.id));
  assert.equal((await prisma.contractor.findUniqueOrThrow({ where: { id: w.contractor.id } })).name, 'Contractor');
});

test('import: template round-trip, bad rows reported, good rows imported once', async () => {
  const w = await world();
  const owner = await signIn(w.people.owner);
  const tpl = await fetch(`${base()}/import/supplier/template`, { headers: { authorization: `Bearer ${owner.token}` } });
  assert.equal(tpl.status, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await tpl.arrayBuffer());
  const ws = wb.worksheets[0]!;
  ws.addRow(['Khodiyar Sand', '9825011111', '']);
  ws.addRow(['Bad GST Traders', '', 'NOT-A-GSTIN']);
  const file = Buffer.from(await wb.xlsx.writeBuffer());
  const send = (commit: boolean) => fetch(`${base()}/import/supplier${commit ? '?commit=1' : ''}`, { method: 'POST', headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/octet-stream' }, body: file }).then((r) => r.json() as Promise<{ total: number; ok: number; imported: number }>);
  const check = await send(false);
  assert.deepEqual([check.total, check.ok, check.imported], [3, 2, 0]);
  const done = await send(true);
  assert.equal(done.imported, 2);
  assert.equal(await prisma.supplier.count({ where: { companyId: w.companyId } }), 2);
  const sup = await signIn(w.people.supervisor);
  assert.equal((await fetch(`${base()}/import/supplier?commit=1`, { method: 'POST', headers: { authorization: `Bearer ${sup.token}` }, body: file })).status, 403);
});
