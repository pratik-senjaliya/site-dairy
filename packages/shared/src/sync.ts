import { z } from 'zod';
import { isoDateSchema, paiseSchema, qtySchema, uuidSchema } from './schemas';

// Wire format for /sync/pull and /sync/push. Table keys are the Prisma model names (camelCase);
// rows use the same field names. Dates are YYYY-MM-DD, money is paise, quantities are numbers.
// A delete is a row with deletedAt set (soft delete only).

const base = { id: uuidSchema, deletedAt: z.string().datetime().nullable().optional() };
const optId = uuidSchema.nullable().optional();
const text = (max: number) => z.string().trim().max(max).nullable().optional();

export const pushRowSchemas = {
  attendanceEntry: z.object({
    ...base,
    projectId: uuidSchema,
    date: isoDateSchema,
    contractorId: uuidSchema,
    skillId: uuidSchema,
    count: z.number().int().min(0).max(999),
    halfDayCount: z.number().int().min(0).max(999),
    otHours: z.number().min(0).max(9999),
    photoId: optId,
    /** The phone's own date when the entry was made; lets an offline entry sync next morning without approval. */
    recordedOn: isoDateSchema.optional(),
  }),
  advance: z.object({
    ...base,
    projectId: uuidSchema,
    contractorId: uuidSchema,
    workerId: optId,
    amountPaise: paiseSchema.min(1),
    date: isoDateSchema,
    mode: z.enum(['cash', 'upi', 'bank']),
  }),
  indent: z.object({
    ...base,
    projectId: uuidSchema,
    status: z.enum(['draft', 'submitted']),
    neededBy: isoDateSchema.nullable().optional(),
    note: text(500),
  }),
  indentLine: z.object({ ...base, indentId: uuidSchema, materialId: uuidSchema, qty: qtySchema.positive() }),
  grn: z.object({
    ...base,
    projectId: uuidSchema,
    supplierId: optId,
    poId: optId,
    challanNo: text(60),
    vehicleNo: text(20),
    date: isoDateSchema,
    note: text(500),
  }),
  grnLine: z.object({
    ...base,
    grnId: uuidSchema,
    materialId: uuidSchema,
    qty: qtySchema.positive(),
    rejectedQty: qtySchema.default(0),
    ratePaise: paiseSchema.nullable().optional(),
  }),
  materialIssue: z.object({
    ...base,
    projectId: uuidSchema,
    materialId: uuidSchema,
    qty: qtySchema.positive(),
    workItemId: optId,
    structureNodeId: optId,
    date: isoDateSchema,
  }),
  stockTransfer: z.object({
    ...base,
    fromProjectId: uuidSchema,
    toProjectId: uuidSchema,
    materialId: uuidSchema,
    qty: qtySchema.positive(),
    status: z.enum(['sent', 'received', 'cancelled']),
  }),
  siteDay: z.object({
    ...base,
    projectId: uuidSchema,
    date: isoDateSchema,
    marker: z.enum(['work', 'weather', 'holiday', 'no_work']),
    note: text(2000),
  }),
  dailyProgress: z.object({
    ...base,
    projectId: uuidSchema,
    date: isoDateSchema,
    workItemId: uuidSchema,
    structureNodeId: optId,
    percent: z.number().int().min(0).max(100),
    note: text(2000),
  }),
  issue: z.object({
    ...base,
    projectId: uuidSchema,
    title: z.string().trim().min(1).max(300),
    assignedToId: optId,
    status: z.enum(['open', 'resolved']),
  }),
  photo: z.object({
    ...base,
    projectId: uuidSchema,
    takenAt: z.string().datetime(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    sourceType: z.enum(['attendance', 'grn', 'progress', 'issue', 'site_day']),
    sourceId: uuidSchema,
  }),
} as const;

export type PushTable = keyof typeof pushRowSchemas;
export const PUSH_TABLES = Object.keys(pushRowSchemas) as PushTable[];
export type PushRow<T extends PushTable> = z.infer<(typeof pushRowSchemas)[T]>;

/** Parents before children, so lines find their header in the same push. */
export const PUSH_ORDER: PushTable[] = [
  'photo', 'attendanceEntry', 'advance', 'indent', 'indentLine', 'grn', 'grnLine', 'materialIssue', 'stockTransfer', 'siteDay', 'dailyProgress', 'issue',
];

export const PULL_TABLES = [
  'project', 'structureNode', 'workItem', 'contractor', 'skill', 'worker', 'material', 'supplier', 'siteMaterialSetting', 'user',
  'purchaseOrder', 'poLine', ...PUSH_ORDER,
] as const;
export type PullTable = (typeof PULL_TABLES)[number];

export const pushRequestSchema = z.object({
  changes: z.record(z.string(), z.array(z.record(z.string(), z.unknown())).max(2000)),
});

export interface PushResult {
  applied: number;
  /** An attendance or site-day row merged into an existing one with another id: drop yours, pull theirs. */
  remapped: Record<string, string>;
  /** Locked attendance sent for approval instead of applied. */
  pending: string[];
  rejected: { table: string; id: string; reason: string }[];
}

export interface StockRow {
  projectId: string;
  materialId: string;
  qty: number;
}

export interface PullResponse {
  rev: string;
  changes: Partial<Record<PullTable, Record<string, unknown>[]>>;
  stock: StockRow[];
  today: string;
}
