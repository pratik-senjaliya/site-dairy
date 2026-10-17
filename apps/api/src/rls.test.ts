import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { requestContext } from './lib/context';
import { base, prisma, transaction } from './lib/prisma';
import { world } from './testUtils';

after(() => prisma.$disconnect());

test('RLS: inside a request for company A, Postgres hides and refuses company B rows even without a where clause', async () => {
  const a = await world();
  const b = await world();
  await requestContext.run({ companyId: a.companyId }, async () => {
    assert.equal(await prisma.contractor.findUnique({ where: { id: b.contractor.id } }), null, 'B is invisible by id');
    const all = await prisma.contractor.findMany();
    assert.ok(all.length > 0 && all.every((c) => c.companyId === a.companyId), 'an unfiltered list only has A');
    assert.equal((await prisma.contractor.updateMany({ where: { id: b.contractor.id }, data: { name: 'x' } })).count, 0);
    await assert.rejects(prisma.contractor.create({ data: { companyId: b.companyId, name: 'planted' } }), 'cannot write into B');
    await assert.rejects(transaction((tx) => tx.skill.create({ data: { companyId: b.companyId, nameGu: 'x', nameEn: 'x' } })));
  });
  assert.ok(await prisma.contractor.findUnique({ where: { id: b.contractor.id } }), 'system context (jobs) sees all');
});

test('RLS: a query that skips the settings sees nothing (safe default)', async () => {
  await world();
  const roleExists = (await base.$queryRaw<{ ok: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'site_app') AS ok`)[0]!.ok;
  assert.ok(roleExists, 'migration created the site_app role');
  const [, rows] = await base.$transaction([base.$executeRaw`SELECT set_config('role', 'site_app', true)`, base.contractor.findMany()]);
  assert.equal(rows.length, 0);
});

test('no code opens an interactive transaction that would skip the RLS settings', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = path.join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts') && !p.endsWith('prisma.ts') && /\b(prisma|base)\.\$transaction\(\s*async|\b(prisma|base)\.\$transaction\(\s*\(/.test(readFileSync(p, 'utf8')) && !p.endsWith('rls.test.ts')) offenders.push(p);
    }
  };
  walk(__dirname);
  assert.deepEqual(offenders, [], 'use transaction() from lib/prisma');
});
