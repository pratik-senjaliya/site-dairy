import type { Language } from '@prisma/client';
import { companySettingsSchema } from '@site-diary/shared';
import { MATERIALS, SKILLS, WORK_ITEM_TEMPLATES } from '../../catalog';
import type { Tx } from '../../lib/db';

/** New tenant: company, its owner and the starting lists (skills, materials, work-item templates). */
export async function createCompany(tx: Tx, input: { name: string; ownerName: string; phone: string; language?: Language }) {
  const company = await tx.company.create({
    data: { name: input.name, language: input.language ?? 'gu', settings: companySettingsSchema.parse({ language: input.language ?? 'gu' }) },
  });
  const companyId = company.id;
  const owner = await tx.user.create({ data: { companyId, name: input.ownerName, phone: input.phone, role: 'owner', language: input.language ?? 'gu' } });
  const createdById = owner.id;
  await tx.skill.createMany({ data: SKILLS.map((s, sort) => ({ companyId, nameGu: s.gu, nameEn: s.en, sort, createdById })) });
  await tx.material.createMany({
    data: MATERIALS.map((m) => ({ companyId, nameGu: m.gu, nameEn: m.en, unit: m.unit, category: m.category, createdById })),
  });
  for (const [projectType, items] of Object.entries(WORK_ITEM_TEMPLATES)) {
    await tx.workItemTemplate.createMany({
      data: items.map(([nameGu, nameEn], sort) => ({ companyId, projectType: projectType as keyof typeof WORK_ITEM_TEMPLATES, nameGu, nameEn, sort, createdById })),
    });
  }
  await tx.auditLog.create({ data: { companyId, userId: owner.id, action: 'create', entityType: 'company', entityId: companyId, after: { name: input.name } } });
  return { company, owner };
}
