import { z } from 'zod';
import { LANGUAGES, isoDateSchema, paiseSchema, phoneSchema, qtySchema, ROLES, UNITS, uuidSchema } from './schemas';

const name = z.string().trim().min(1, 'Required').max(120);
const opt = (s: z.ZodTypeAny) => z.union([z.literal('').transform(() => null), z.null(), s]).optional();
const optPhone = opt(phoneSchema);

export const PROJECT_TYPES = ['rcc_frame', 'load_bearing', 'bungalow'] as const;

export const projectSchema = z.object({
  name,
  address: opt(z.string().trim().max(300)),
  reraNo: opt(z.string().trim().max(60)),
  startDate: isoDateSchema.nullable().optional(),
  endDate: isoDateSchema.nullable().optional(),
  budgetPaise: paiseSchema.nullable().optional(),
  type: z.enum(PROJECT_TYPES),
  status: z.enum(['active', 'on_hold', 'completed']).default('active'),
});

export const bulkFloorsSchema = z.object({
  towerName: name,
  floors: z.number().int().min(0).max(80),
  basements: z.number().int().min(0).max(5).default(0),
  ground: z.boolean().default(true),
});

export const masterSchemas = {
  contractor: z.object({
    name,
    phone: optPhone,
    trade: opt(z.string().trim().max(60)),
    rateType: z.enum(['daily', 'lump_sum', 'per_unit']).default('daily'),
  }),
  skill: z.object({ nameGu: name, nameEn: name, sort: z.number().int().default(0) }),
  contractorRate: z.object({ contractorId: uuidSchema, skillId: uuidSchema, dailyRatePaise: paiseSchema.min(1), effectiveFrom: isoDateSchema }),
  worker: z.object({
    contractorId: uuidSchema,
    name,
    skillId: uuidSchema.nullable().optional(),
    phone: optPhone,
  }),
  material: z.object({ nameGu: name, nameEn: name, unit: z.enum(UNITS), category: opt(z.string().trim().max(40)) }),
  supplier: z.object({
    name,
    phone: optPhone,
    gstin: opt(z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'Enter a valid 15-character GSTIN')),
  }),
  siteMaterialSetting: z.object({ projectId: uuidSchema, materialId: uuidSchema, minStock: qtySchema }),
  workItem: z.object({ projectId: uuidSchema, nameGu: name, nameEn: name, sort: z.number().int().default(0) }),
  structureNode: z.object({
    projectId: uuidSchema,
    parentId: uuidSchema.nullable().optional(),
    kind: z.enum(['tower', 'floor', 'unit']),
    name,
    sort: z.number().int().default(0),
  }),
} as const;
export type MasterKind = keyof typeof masterSchemas;

export const userSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: phoneSchema,
  role: z.enum(ROLES),
  language: z.enum(LANGUAGES).default('gu'),
  siteIds: z.array(uuidSchema).default([]),
  isActive: z.boolean().default(true),
});

export const companySchema = z.object({
  name: z.string().trim().min(2).max(120),
  gstin: opt(z.string().trim().toUpperCase().max(15)),
  logoUrl: opt(z.string().url().max(500)),
});
