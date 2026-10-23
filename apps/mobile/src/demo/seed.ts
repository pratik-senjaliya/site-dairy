import { addDays, isoDate, MATERIALS, rupeesToPaise, SKILLS, WORK_ITEM_TEMPLATES } from '@site-diary/shared';
import { randomUUID } from 'expo-crypto';

// The demo company, made on the phone: same people, site and two weeks of history as the server's demo seed.

export type DemoRow = { id: string; [k: string]: unknown };
export type Tables = Record<string, DemoRow[]>;

export const DEMO_USERS = [
  { name: 'Rameshbhai Patel', phone: '+919800000001', role: 'owner' },
  { name: 'Hardik Shah', phone: '+919800000002', role: 'engineer' },
  { name: 'Kanubhai Rathod', phone: '+919800000003', role: 'supervisor' },
  { name: 'Vipul Prajapati', phone: '+919800000004', role: 'store' },
  { name: 'Nisha Mehta', phone: '+919800000005', role: 'accountant' },
] as const;

export function seedDemo(): { t: Tables; approvals: DemoRow[]; companyId: string } {
  const companyId = randomUUID();
  const now = new Date().toISOString();
  const base = (extra: Record<string, unknown>): DemoRow => ({ id: randomUUID(), companyId, createdAt: now, updatedAt: now, deletedAt: null, serverRev: 1, ...extra });
  const t: Tables = {};
  const add = (table: string, row: DemoRow) => ((t[table] ??= []).push(row), row);

  const users = DEMO_USERS.map((u) => add('user', base({ ...u, language: u.role === 'accountant' ? 'en' : 'gu', isActive: true })));
  const today = isoDate();
  const project = add('project', base({ name: 'Shivam Heights', address: 'Near Nikol Gam, Nikol, Ahmedabad', type: 'rcc_frame', status: 'active', startDate: addDays(today, -120), budgetPaise: rupeesToPaise(6_50_00_000) }));
  const projectId = project.id;
  const skills = SKILLS.map((s, i) => add('skill', base({ nameGu: s.gu, nameEn: s.en, sort: i })));
  const materials = MATERIALS.map((m) => add('material', base({ nameGu: m.gu, nameEn: m.en, unit: m.unit, category: m.category })));
  const tower = add('structureNode', base({ projectId, parentId: null, kind: 'tower', name: 'B block', sort: 0 }));
  const floors = ['Ground', ...Array.from({ length: 12 }, (_, i) => `Floor ${i + 1}`)].map((name, sort) => add('structureNode', base({ projectId, parentId: tower.id, kind: 'floor', name, sort })));
  const items = WORK_ITEM_TEMPLATES.rcc_frame.map(([gu, en], sort) => add('workItem', base({ projectId, nameGu: gu, nameEn: en, sort })));
  const sk = (p: string) => skills.find((s) => String(s.nameEn).startsWith(p))!;
  const contractors = [
    { name: 'Bharat Construction (Bharatbhai)', trade: 'Civil', skills: ['Mason', 'Helper'] },
    { name: 'Jay Ambe Shuttering', trade: 'Shuttering', skills: ['Carpenter', 'Helper'] },
    { name: 'Mahadev Steel Works', trade: 'Steel', skills: ['Bar bender', 'Helper'] },
  ].map((c) => ({ row: add('contractor', base({ name: c.name, trade: c.trade, rateType: 'daily' })), skills: c.skills.map(sk) }));
  // Daily rates (₹) per contractor × skill, for the hisab and today's labour cost.
  const rate = (en: string) => (en.startsWith('Mason') ? 950 : en.startsWith('Carpenter') ? 900 : en.startsWith('Bar') ? 850 : 550);
  for (const c of contractors) for (const s of c.skills) add('contractorRate', base({ contractorId: c.row.id, skillId: s.id, dailyRatePaise: rupeesToPaise(rate(String(s.nameEn))), effectiveFrom: addDays(today, -120) }));
  add('worker', base({ contractorId: contractors[1]!.row.id, name: 'Ramesh Vaghela', skillId: sk('Carpenter').id }));
  const suppliers = ['Umiya Cement Traders', 'Khodiyar Sand Supplier', 'Shakti Steel'].map((name) => add('supplier', base({ name })));
  const mat = (en: string) => materials.find((m) => m.nameEn === en)!;
  add('siteMaterialSetting', base({ projectId, materialId: mat('Cement').id, minStock: 100 }));
  const sup = users[2]!;
  const store = users[3]!;

  let seed = 7;
  const rnd = (n: number) => ((seed = (seed * 9301 + 49297) % 233280), Math.floor((seed / 233280) * n));
  for (let back = 14; back >= 1; back--) {
    const date = addDays(today, -back);
    if (new Date(`${date}T12:00:00Z`).getUTCDay() === 0) {
      add('siteDay', base({ projectId, date, marker: 'holiday', note: 'રવિવાર', createdById: sup.id }));
      continue;
    }
    contractors.forEach((c) =>
      c.skills.forEach((s, i) => add('attendanceEntry', base({ projectId, date, contractorId: c.row.id, skillId: s.id, count: (i === 0 ? 6 : 10) + rnd(4), halfDayCount: rnd(3) === 0 ? 1 : 0, otHours: rnd(5) === 0 ? 2 : 0, photoId: null, locked: true, createdById: sup.id }))),
    );
    if (back % 3 === 1) {
      const g = add('grn', base({ projectId, supplierId: suppliers[0]!.id, poId: null, challanNo: `UC-${1200 + back}`, vehicleNo: 'GJ01 AB 4521', date, note: null, createdById: store.id }));
      add('grnLine', base({ grnId: g.id, materialId: mat('Cement').id, qty: 150, rejectedQty: back === 4 ? 3 : 0, ratePaise: rupeesToPaise(375) }));
    }
    if (back % 5 === 2) {
      const g = add('grn', base({ projectId, supplierId: suppliers[1]!.id, poId: null, challanNo: `KS-${300 + back}`, vehicleNo: 'GJ27 X 9087', date, note: null, createdById: store.id }));
      add('grnLine', base({ grnId: g.id, materialId: mat('Sand').id, qty: 4, rejectedQty: 0, ratePaise: null }));
    }
    const floor = floors[Math.min(floors.length - 1, 4 + Math.floor((14 - back) / 5))]!;
    add('materialIssue', base({ projectId, materialId: mat('Cement').id, qty: 40 + rnd(20), workItemId: items[4]!.id, structureNodeId: floor.id, date, createdById: store.id }));
    add('materialIssue', base({ projectId, materialId: mat('Sand').id, qty: 0.5, workItemId: items[5]!.id, structureNodeId: floors[3]!.id, date, createdById: store.id }));
    add('dailyProgress', base({ projectId, date, workItemId: items[2]!.id, structureNodeId: floor.id, percent: Math.min(100, 20 + (14 - back) * 6), note: 'કોલમ શટરિંગ અને કાસ્ટિંગ', createdById: sup.id }));
  }
  add('advance', base({ projectId, contractorId: contractors[0]!.row.id, workerId: null, amountPaise: rupeesToPaise(5000), date: addDays(today, -2), mode: 'cash', settlementId: null, createdById: sup.id }));
  add('advance', base({ projectId, contractorId: contractors[1]!.row.id, workerId: null, amountPaise: rupeesToPaise(3000), date: addDays(today, -4), mode: 'upi', settlementId: null, createdById: sup.id }));
  const indent = add('indent', base({ projectId, status: 'submitted', requestedById: sup.id, neededBy: addDays(today, 3), note: 'સ્લેબ માટે', createdById: sup.id }));
  add('indentLine', base({ indentId: indent.id, materialId: mat('Cement').id, qty: 300 }));
  add('indentLine', base({ indentId: indent.id, materialId: mat('TMT steel').id, qty: 2500 }));
  // Approved earlier, needed by yesterday and not come yet: shows up as late material for the store and the owner.
  const blocks = add('indent', base({ projectId, status: 'approved', requestedById: sup.id, approvedById: users[0]!.id, neededBy: addDays(today, -1), note: null, createdById: sup.id, createdAt: `${addDays(today, -4)}T05:30:00.000Z` }));
  add('indentLine', base({ indentId: blocks.id, materialId: mat('AAC blocks').id, qty: 2000 }));
  add('issue', base({ projectId, title: 'લિફ્ટ શાફ્ટ પાસે પાણી ભરાય છે', status: 'open', assignedToId: null, createdById: sup.id }));
  const approvals = [base({ projectId, entityType: 'indent', entityId: indent.id, requestedById: sup.id, status: 'pending', proposal: null })];
  return { t, approvals, companyId };
}
