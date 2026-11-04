import { z } from 'zod';
import { isoDateSchema, paiseSchema, uuidSchema } from './schemas';

// The partners' book: flats and their buyers, money in and out. Supplier payments, upad and paid wage
// settlements are already in the app, so the book adds them itself ("auto" lines) and nobody enters them twice.

export const PAY_MODES = ['cash', 'upi', 'bank', 'cheque'] as const;
export type PayMode = (typeof PAY_MODES)[number];

export const MONEY_IN_KINDS = ['flat', 'partner', 'loan', 'other'] as const;
export const MONEY_OUT_KINDS = ['labour', 'material', 'partner', 'other'] as const;
export type MoneyKind = (typeof MONEY_IN_KINDS)[number] | (typeof MONEY_OUT_KINDS)[number];

const text = (max: number) => z.string().trim().max(max).nullable().optional();

export const unitSchema = z.object({
  id: uuidSchema.optional(),
  projectId: uuidSchema,
  name: z.string().trim().min(1).max(60),
  buyerName: text(120),
  buyerPhone: text(20),
  dealPaise: paiseSchema.nullable().optional(),
  note: text(500),
});
export type UnitInput = z.infer<typeof unitSchema>;

export const moneyEntrySchema = z
  .object({
    id: uuidSchema.optional(),
    projectId: uuidSchema.nullable().optional(),
    direction: z.enum(['in', 'out']),
    kind: z.enum(['flat', 'partner', 'loan', 'labour', 'material', 'other']),
    unitId: uuidSchema.nullable().optional(),
    party: text(120),
    amountPaise: paiseSchema.min(1),
    date: isoDateSchema,
    mode: z.enum(PAY_MODES),
    reference: text(60),
    note: text(500),
  })
  .refine((e) => (e.direction === 'in' ? (MONEY_IN_KINDS as readonly string[]) : (MONEY_OUT_KINDS as readonly string[])).includes(e.kind), { message: 'This kind does not go with this direction', path: ['kind'] })
  .refine((e) => e.kind !== 'flat' || !!e.unitId, { message: 'Pick the flat', path: ['unitId'] });
export type MoneyEntryInput = z.infer<typeof moneyEntrySchema>;

/** One line of the book as the API sends it: an entry of the book, or a payment made elsewhere in the app. */
export interface BookLine {
  id: string;
  source: 'entry' | 'supplier' | 'upad' | 'wages';
  projectId: string | null;
  direction: 'in' | 'out';
  kind: MoneyKind | 'supplier' | 'upad' | 'wages';
  unitId: string | null;
  party: string | null;
  amountPaise: number;
  date: string;
  mode: PayMode | null;
  reference: string | null;
  note: string | null;
  by: string | null;
  byId: string | null;
  at: string;
  /** Removed entries stay in the book, struck through, with who removed them. */
  removed: { by: string | null; at: string } | null;
}

/** Money in, out and in hand; removed lines do not count. */
export function bookTotals(lines: Pick<BookLine, 'direction' | 'amountPaise' | 'removed'>[]) {
  let inPaise = 0;
  let outPaise = 0;
  for (const l of lines) {
    if (l.removed) continue;
    if (l.direction === 'in') inPaise += l.amountPaise;
    else outPaise += l.amountPaise;
  }
  return { inPaise, outPaise, balancePaise: inPaise - outPaise };
}

/** A flat's account: what the buyer has paid against the deal and what is still to come. */
export function unitAccount(dealPaise: number | null, lines: Pick<BookLine, 'direction' | 'amountPaise' | 'removed' | 'unitId'>[], unitId: string) {
  const receivedPaise = lines.filter((l) => !l.removed && l.unitId === unitId && l.direction === 'in').reduce((s, l) => s + l.amountPaise, 0);
  return { receivedPaise, duePaise: dealPaise == null ? null : Math.max(0, dealPaise - receivedPaise) };
}

// Buyers pay by stage (construction-linked plan): a site has one plan, each stage a share of the deal. When the
// owner marks a stage reached, that share of every sold flat falls due.

export const payStagesSchema = z
  .object({
    projectId: uuidSchema,
    stages: z.array(z.object({ id: uuidSchema.optional(), name: z.string().trim().min(1).max(60), percent: z.number().positive().max(100) })).max(40),
  })
  .refine((p) => p.stages.reduce((s, x) => s + x.percent, 0) <= 100.001, { message: 'The stages add up to more than 100%', path: ['stages'] });
export type PayStagesInput = z.infer<typeof payStagesSchema>;

export interface PayStage { id: string; name: string; percent: number; sort: number; reachedOn: string | null }

/**
 * A flat's instalments: each stage's amount (the rounding goes to the last stage when the plan is 100%), what
 * has fallen due so far (stages reached), and what is due now after what the buyer already paid.
 */
export function unitSchedule(dealPaise: number | null, stages: PayStage[], receivedPaise: number) {
  if (dealPaise == null || !stages.length) return { stages: [], duePaise: 0, dueNowPaise: null as number | null };
  const sorted = [...stages].sort((a, b) => a.sort - b.sort);
  const full = Math.abs(sorted.reduce((s, x) => s + x.percent, 0) - 100) < 0.001;
  let given = 0;
  const rows = sorted.map((s, i) => {
    const amount = full && i === sorted.length - 1 ? dealPaise - given : Math.round((dealPaise * s.percent) / 100);
    given += amount;
    return { ...s, amountPaise: amount };
  });
  // Payments fill stages in order, so each stage shows paid / part paid / due.
  let left = receivedPaise;
  const withPaid = rows.map((r) => {
    const paid = Math.min(r.amountPaise, Math.max(0, left));
    left -= paid;
    return { ...r, paidPaise: paid };
  });
  const duePaise = rows.filter((r) => r.reachedOn).reduce((s, r) => s + r.amountPaise, 0);
  return { stages: withPaid, duePaise, dueNowPaise: Math.max(0, duePaise - receivedPaise) };
}
