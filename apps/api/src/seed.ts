// Demo data: one company with a supervisor-ready site. Safe to run twice (skips if the demo company exists).
import { Prisma } from '@prisma/client';
import { addDays, isoDate, rupeesToPaise } from '@site-diary/shared';
import { prisma, transaction } from './lib/prisma';
import { createCompany } from './modules/company/setup';
import { rebuildLedger } from './modules/store/ledger';

const DEMO_COMPANY = 'Shree Ganesh Builders (demo)';
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function main() {
  if (await prisma.company.findFirst({ where: { name: DEMO_COMPANY } })) {
    console.log('Demo company already seeded');
    return;
  }

  await transaction(async (tx) => {
    const { company, owner } = await createCompany(tx, { name: DEMO_COMPANY, ownerName: 'Rameshbhai Patel', phone: '+919800000001' });
    const companyId = company.id;
    const createdById = owner.id;
    const people = [
      { name: 'Hardik Shah', phone: '+919800000002', role: 'engineer' },
      { name: 'Kanubhai Rathod', phone: '+919800000003', role: 'supervisor' },
      { name: 'Vipul Prajapati', phone: '+919800000004', role: 'store' },
      { name: 'Nisha Mehta', phone: '+919800000005', role: 'accountant' },
    ] as const;
    const users = [owner, ...(await Promise.all(people.map((p) => tx.user.create({ data: { ...p, companyId, language: p.role === 'accountant' ? 'en' : 'gu', createdById } }))))];
    const skills = await tx.skill.findMany({ where: { companyId } });
    const materials = await tx.material.findMany({ where: { companyId } });

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
  await history();
  console.log('Seeded demo company. Owner phone +919800000001');
}

// Two weeks of believable site life for the demo: attendance, receipts, usage, progress, an indent and an issue.
async function history() {
  const company = await prisma.company.findFirstOrThrow({ where: { name: DEMO_COMPANY } });
  const companyId = company.id;
  const project = await prisma.project.findFirstOrThrow({ where: { companyId, name: 'Shivam Heights' } });
  const users = await prisma.user.findMany({ where: { companyId } });
  const sup = users.find((u) => u.role === 'supervisor')!;
  const store = users.find((u) => u.role === 'store')!;
  const contractors = await prisma.contractor.findMany({ where: { companyId }, include: { rates: true } });
  const materials = await prisma.material.findMany({ where: { companyId } });
  const suppliers = await prisma.supplier.findMany({ where: { companyId } });
  const items = await prisma.workItem.findMany({ where: { projectId: project.id }, orderBy: { sort: 'asc' } });
  const floors = await prisma.structureNode.findMany({ where: { projectId: project.id, kind: 'floor' }, orderBy: { sort: 'asc' } });
  const mat = (en: string) => materials.find((m) => m.nameEn === en)!;
  const today = isoDate();
  let seed = 7;
  const rnd = (n: number) => ((seed = (seed * 9301 + 49297) % 233280), Math.floor((seed / 233280) * n));

  for (let back = 14; back >= 0; back--) {
    const date = addDays(today, -back);
    const d = day(date);
    const sunday = new Date(`${date}T12:00:00Z`).getUTCDay() === 0;
    if (sunday) {
      await prisma.siteDay.create({ data: { companyId, projectId: project.id, date: d, marker: 'holiday', note: 'રવિવાર', createdById: sup.id } });
      continue;
    }
    if (back === 0) continue; // today is for the person testing to fill in
    for (const c of contractors) {
      for (const r of c.rates) {
        const base = r.skillId === c.rates[0]!.skillId ? 6 : 10;
        await prisma.attendanceEntry.create({
          data: { companyId, projectId: project.id, date: d, contractorId: c.id, skillId: r.skillId, count: base + rnd(4) - (back === 3 ? 5 : 0), halfDayCount: rnd(3) === 0 ? 1 : 0, otHours: rnd(5) === 0 ? 2 : 0, locked: true, createdById: sup.id },
        });
      }
    }
    if (back % 3 === 1) {
      const grn = await prisma.grn.create({
        data: { companyId, projectId: project.id, supplierId: suppliers[0]!.id, challanNo: `UC-${1200 + back}`, vehicleNo: 'GJ01 AB 4521', date: d, createdById: store.id,
          lines: { create: [{ companyId, materialId: mat('Cement').id, qty: 150, rejectedQty: back === 4 ? 3 : 0, ratePaise: BigInt(rupeesToPaise(375)), createdById: store.id }] } },
        include: { lines: true },
      });
      await rebuild(companyId, 'grn', grn.id);
    }
    if (back % 5 === 2) {
      const grn = await prisma.grn.create({
        data: { companyId, projectId: project.id, supplierId: suppliers[1]!.id, challanNo: `KS-${300 + back}`, vehicleNo: 'GJ27 X 9087', date: d, createdById: store.id,
          lines: { create: [{ companyId, materialId: mat('Sand').id, qty: 4, rejectedQty: 0, ratePaise: BigInt(rupeesToPaise(4200)), createdById: store.id }, { companyId, materialId: mat('Aggregate 20mm').id, qty: 3, rejectedQty: 0, createdById: store.id }] } },
      });
      await rebuild(companyId, 'grn', grn.id);
    }
    const floor = floors[Math.min(floors.length - 1, 4 + Math.floor((14 - back) / 5))]!;
    for (const [en, qty] of [['Cement', 40 + rnd(20)], ['Sand', 0.5]] as const) {
      const issue = await prisma.materialIssue.create({ data: { companyId, projectId: project.id, materialId: mat(en).id, qty, workItemId: items.find((i) => i.nameEn === 'Slab')!.id, structureNodeId: floor.id, date: d, createdById: store.id } });
      await rebuild(companyId, 'issue', issue.id);
    }
    await prisma.dailyProgress.create({ data: { companyId, projectId: project.id, date: d, workItemId: items.find((i) => i.nameEn === 'Column')!.id, structureNodeId: floor.id, percent: Math.min(100, 20 + (14 - back) * 6), note: 'કોલમ શટરિંગ અને કાસ્ટિંગ', createdById: sup.id } });
    if (back % 4 === 0) {
      await prisma.dailyProgress.create({ data: { companyId, projectId: project.id, date: d, workItemId: items.find((i) => i.nameEn === 'Masonry')!.id, structureNodeId: floors[2]!.id, percent: Math.min(100, 40 + (14 - back) * 4), note: null, createdById: sup.id } });
    }
  }
  const indent = await prisma.indent.create({
    data: { companyId, projectId: project.id, status: 'submitted', requestedById: sup.id, neededBy: day(addDays(today, 3)), note: 'સ્લેબ માટે', createdById: sup.id,
      lines: { create: [{ companyId, materialId: mat('Cement').id, qty: 300, createdById: sup.id }, { companyId, materialId: mat('TMT steel').id, qty: 2500, createdById: sup.id }] } },
  });
  await prisma.approval.create({ data: { companyId, projectId: project.id, entityType: 'indent', entityId: indent.id, requestedById: sup.id, createdById: sup.id } });
  // Approved earlier, needed by yesterday and not come yet: late material for the store keeper and the owner.
  await prisma.indent.create({
    data: { companyId, projectId: project.id, status: 'approved', requestedById: sup.id, approvedById: users.find((u) => u.role === 'owner')!.id, neededBy: day(addDays(today, -1)), createdById: sup.id, createdAt: new Date(`${addDays(today, -4)}T05:30:00.000Z`),
      lines: { create: [{ companyId, materialId: mat('AAC blocks').id, qty: 2000, createdById: sup.id }] } },
  });
  await prisma.issue.create({ data: { companyId, projectId: project.id, title: 'લિફ્ટ શાફ્ટ પાસે પાણી ભરાય છે', status: 'open', createdById: sup.id } });
}

async function rebuild(companyId: string, source: 'grn' | 'issue', id: string) {
  await transaction((tx) => rebuildLedger(tx, companyId, source, id));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
