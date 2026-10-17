// Vendor command: change a company's plan.  npm run set-plan -w apps/api -- <owner phone> <pilot|basic|pro>
import { isPlan, phoneSchema } from '@site-diary/shared';
import { prisma } from './lib/prisma';

async function main() {
  const [phoneArg, plan] = process.argv.slice(2);
  if (!phoneArg || !plan || !isPlan(plan)) throw new Error('Usage: set-plan <owner phone> <pilot|basic|pro>');
  const owner = await prisma.user.findFirst({ where: { phone: phoneSchema.parse(phoneArg), role: 'owner', deletedAt: null } });
  if (!owner) throw new Error('No owner with that phone');
  const c = await prisma.company.update({ where: { id: owner.companyId }, data: { plan } });
  await prisma.auditLog.create({ data: { companyId: c.id, action: 'update', entityType: 'company', entityId: c.id, after: { plan } } });
  console.log(`${c.name}: plan is now ${plan}`);
}
main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
