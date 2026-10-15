// Demo data: one company with a supervisor-ready site. Safe to run twice (skips if the demo company exists).
import { Prisma, type ProjectType } from '@prisma/client';
import { addDays, isoDate, rupeesToPaise } from '@site-diary/shared';
import { MATERIALS, SKILLS, WORK_ITEM_TEMPLATES } from './catalog';
import { prisma } from './lib/prisma';

const DEMO_COMPANY = 'Shree Ganesh Builders (demo)';
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function main() {
  if (await prisma.company.findFirst({ where: { name: DEMO_COMPANY } })) {
    console.log('Demo company already seeded');
    return;
  }

  await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: { name: DEMO_COMPANY, settings: { reportTime: '20:00', poApprovalAbovePaise: rupeesToPaise(50000), noEntryCutoff: '19:00' } },
    });
    const companyId = company.id;

    const people = [
      { name: 'Rameshbhai Patel', phone: '+919800000001', role: 'owner' },
      { name: 'Hardik Shah', phone: '+919800000002', role: 'engineer' },
      { name: 'Kanubhai Rathod', phone: '+919800000003', role: 'supervisor' },
      { name: 'Vipul Prajapati', phone: '+919800000004', role: 'store' },
      { name: 'Nisha Mehta', phone: '+919800000005', role: 'accountant' },
    ] as const;
    const users = await Promise.all(people.map((p) => tx.user.create({ data: { ...p, companyId, language: p.role === 'accountant' ? 'en' : 'gu' } })));
    const owner = users[0]!;
    const createdById = owner.id;

    const skills = await Promise.all(
      SKILLS.map((s, i) => tx.skill.create({ data: { companyId, nameGu: s.gu, nameEn: s.en, sort: i, createdById } })),
    );
    const materials = await Promise.all(
      MATERIALS.map((m) => tx.material.create({ data: { companyId, nameGu: m.gu, nameEn: m.en, unit: m.unit, category: m.category, createdById } })),
    );
    for (const [type, items] of Object.entries(WORK_ITEM_TEMPLATES) as [ProjectType, [string, string][]][]) {
      await tx.workItemTemplate.createMany({
        data: items.map(([gu, en], sort) => ({ companyId, projectType: type, nameGu: gu, nameEn: en, sort, createdById })),
      });
    }

    const today = isoDate();
    const project = await tx.project.create({
      data: {
        companyId,
        name: 'Shivam Heights',
        address: 'Near Nikol Gam, Nikol, Ahmedabad',
        type: 'rcc_frame',
        startDate: day(addDays(today, -120)),
        budgetPaise: BigInt(rupeesToPaise(6_50_00_000)),
        createdById,
      },
    });
    await tx.userSite.createMany({ data: users.filter((u) => u.role !== 'owner' && u.role !== 'accountant').map((u) => ({ companyId, userId: u.id, projectId: project.id, createdById })) });

    // "B block, 12 floors" — the bulk-create shape from the scope.
    const tower = await tx.structureNode.create({ data: { companyId, projectId: project.id, kind: 'tower', name: 'B block', createdById } });
    await tx.structureNode.createMany({
      data: ['Ground', ...Array.from({ length: 12 }, (_, i) => `Floor ${i + 1}`)].map((name, sort) => ({
        companyId, projectId: project.id, parentId: tower.id, kind: 'floor' as const, name, sort, createdById,
      })),
    });
    const templates = await tx.workItemTemplate.findMany({ where: { companyId, projectType: 'rcc_frame' }, orderBy: { sort: 'asc' } });
    await tx.workItem.createMany({
      data: templates.map((t) => ({ companyId, projectId: project.id, templateId: t.id, nameGu: t.nameGu, nameEn: t.nameEn, sort: t.sort, createdById })),
    });

    const skillByEn = (prefix: string) => skills.find((s) => s.nameEn.startsWith(prefix))!;
    const contractors = [
      { name: 'Bharat Construction (Bharatbhai)', phone: '+919800000011', trade: 'Civil', rates: [['Mason', 900], ['Helper', 550]] },
      { name: 'Jay Ambe Shuttering', phone: '+919800000012', trade: 'Shuttering', rates: [['Carpenter', 950], ['Helper', 550]] },
      { name: 'Mahadev Steel Works', phone: '+919800000013', trade: 'Steel', rates: [['Bar bender', 850], ['Helper', 550]] },
    ] as const;
    for (const c of contractors) {
      const contractor = await tx.contractor.create({ data: { companyId, name: c.name, phone: c.phone, trade: c.trade, createdById } });
      await tx.contractorRate.createMany({
        data: c.rates.map(([skill, rupees]) => ({
          companyId, contractorId: contractor.id, skillId: skillByEn(skill).id, dailyRatePaise: BigInt(rupeesToPaise(rupees)), effectiveFrom: project.startDate!, createdById,
        })),
      });
    }

    await tx.supplier.createMany({
      data: [
        { companyId, name: 'Umiya Cement Traders', phone: '+919800000021', createdById },
        { companyId, name: 'Khodiyar Sand Supplier', phone: '+919800000022', createdById },
        { companyId, name: 'Shakti Steel', phone: '+919800000023', gstin: '24ABCDE1234F1Z5', createdById },
      ],
    });
    const cement = materials.find((m) => m.nameEn === 'Cement')!;
    await tx.siteMaterialSetting.create({ data: { companyId, projectId: project.id, materialId: cement.id, minStock: new Prisma.Decimal(100), createdById } });

    await tx.auditLog.create({ data: { companyId, userId: owner.id, action: 'seed', entityType: 'company', entityId: companyId } });
  });
  console.log('Seeded demo company. Owner phone +919800000001');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
