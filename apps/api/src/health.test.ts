import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import { createApp } from './app';
import { prisma } from './lib/prisma';

after(() => prisma.$disconnect());

test('health reports the database as up', async () => {
  const server = createApp().listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/v1/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { database: string; today: string };
    assert.equal(body.database, 'up');
    assert.match(body.today, /^\d{4}-\d{2}-\d{2}$/);
  } finally {
    server.close();
  }
});

test('server_rev advances on every insert and update, from one sequence', async () => {
  const company = await prisma.company.create({ data: { name: 'rev test' } });
  const updated = await prisma.company.update({ where: { id: company.id }, data: { name: 'rev test 2' } });
  assert.ok(company.serverRev > 0n);
  assert.ok(updated.serverRev > company.serverRev);
  await prisma.company.delete({ where: { id: company.id } });
});

test('audit_log is append-only', async () => {
  const row = await prisma.auditLog.create({ data: { action: 'test', entityType: 'test' } });
  await assert.rejects(prisma.auditLog.update({ where: { id: row.id }, data: { action: 'changed' } }));
  await assert.rejects(prisma.auditLog.delete({ where: { id: row.id } }));
});
