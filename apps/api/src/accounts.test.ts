import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { isoDate, rupeesToPaise, type BookLine } from '@site-diary/shared';
import { prisma } from './lib/prisma';
import { signIn, start, stop, uuid, world } from './testUtils';

before(start);
after(stop);
const today = isoDate();

interface Book { lines: BookLine[]; totals: { inPaise: number; outPaise: number; balancePaise: number }; units: { id: string; receivedPaise: number; duePaise: number | null }[] }

test('accounts: flats, buyer payments, expenses and payments made elsewhere in one book every partner sees', async () => {
  const w = await world();
  const owner = await signIn(w.people.owner);
  const partner = await signIn(w.people.partner);

  const flat = await owner.call<{ id: string }>('POST', '/accounts/units', { projectId: w.siteA.id, name: 'A-101', buyerName: 'Patel', buyerPhone: '9825012345', dealPaise: rupeesToPaise(4500000) });
  assert.equal(flat.status, 201);
  assert.equal((await owner.call('POST', '/accounts/entries', { direction: 'in', kind: 'flat', amountPaise: 100, date: today, mode: 'cash' })).status, 400, 'a flat payment needs the flat');
  const paid = await partner.call<{ id: string }>('POST', '/accounts/entries', { direction: 'in', kind: 'flat', unitId: flat.body.id, amountPaise: rupeesToPaise(1000000), date: today, mode: 'cheque', reference: '004512' });
  assert.equal(paid.status, 201);
  const spent = await owner.call<{ id: string }>('POST', '/accounts/entries', { projectId: w.siteA.id, direction: 'out', kind: 'labour', party: 'Jay Ambe Centering', amountPaise: rupeesToPaise(200000), date: today, mode: 'bank' });
  // Made elsewhere in the app: a supplier payment and an upad come into the book by themselves.
  const supplier = await prisma.supplier.create({ data: { companyId: w.companyId, name: 'Shakti Steel' } });
  await owner.call('POST', '/purchase/supplier-payments', { supplierId: supplier.id, projectId: w.siteA.id, amountPaise: rupeesToPaise(150000), date: today, mode: 'cheque', reference: '778899' });
  const sup = await signIn(w.people.supervisor);
  await sup.call('POST', '/sync/push', { changes: { advance: [{ id: uuid(), projectId: w.siteA.id, contractorId: w.contractor.id, amountPaise: rupeesToPaise(5000), date: today, mode: 'cash' }] } });

  const book = await partner.call<Book>('GET', `/accounts?projectId=${w.siteA.id}`);
  assert.equal(book.status, 200);
  assert.deepEqual(book.body.totals, { inPaise: rupeesToPaise(1000000), outPaise: rupeesToPaise(355000), balancePaise: rupeesToPaise(645000) });
  assert.deepEqual(book.body.lines.map((l) => l.source).sort(), ['entry', 'entry', 'supplier', 'upad']);
  assert.equal(book.body.lines.find((l) => l.id === paid.body.id)?.by, 'partner');
  assert.equal(book.body.lines.find((l) => l.source === 'supplier')?.reference, '778899');
  assert.deepEqual(book.body.units.map((u) => [u.receivedPaise, u.duePaise]), [[rupeesToPaise(1000000), rupeesToPaise(3500000)]]);
  // The other partner (the owner) is told about the partner's entry.
  const told = await prisma.notification.findMany({ where: { companyId: w.companyId, kind: 'money' } });
  assert.ok(told.some((n) => n.userId === owner.userId && n.title.includes('A-101')));

  // Only the writer or the owner removes a line; it stays in the book, struck through, and stops counting.
  assert.equal((await partner.call('DELETE', `/accounts/entries/${spent.body.id}`)).status, 403);
  assert.equal((await owner.call('DELETE', `/accounts/entries/${spent.body.id}`)).status, 200);
  const after = await partner.call<Book>('GET', `/accounts?projectId=${w.siteA.id}`);
  assert.equal(after.body.lines.find((l) => l.id === spent.body.id)?.removed?.by, 'Owner');
  assert.equal(after.body.totals.outPaise, rupeesToPaise(155000));
  assert.equal((await owner.call('DELETE', `/accounts/units/${flat.body.id}`)).status, 409, 'a flat with payments stays');

  // Site staff do not see the money.
  for (const role of ['supervisor', 'engineer', 'store'] as const) {
    assert.equal((await (await signIn(w.people[role])).call('GET', '/accounts')).status, 403, role);
  }
});
