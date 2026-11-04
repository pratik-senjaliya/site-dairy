import { z } from 'zod';
import type { Paise } from './money';
import { isoDateSchema, paiseSchema, qtySchema, uuidSchema } from './schemas';
import type { WageResult } from './wages';

// Contract work: a contractor paid by measurement (centering per sq ft, plaster per sq ft, a lump sum)
// instead of, or as well as, by the day. Measurements are valued at the rate written on them and billed
// once, in the same settlement as the contractor's days and upad.

export const WORK_UNITS = ['sqft', 'rft', 'sqm', 'cft', 'cum', 'nos', 'kg', 'lump'] as const;
export type WorkUnit = (typeof WORK_UNITS)[number];

/** How a contractor is paid: "daily" pays attendance × rate; the others pay only measured work. */
export const paysByDay = (rateType: string | null | undefined) => (rateType ?? 'daily') === 'daily';

export const contractWorkSchema = z.object({
  id: uuidSchema.optional(),
  projectId: uuidSchema,
  contractorId: uuidSchema,
  name: z.string().trim().min(1).max(80),
  unit: z.enum(WORK_UNITS),
  ratePaise: paiseSchema.min(1),
});
export type ContractWorkInput = z.infer<typeof contractWorkSchema>;

export const workMeasureSchema = z.object({
  id: uuidSchema.optional(),
  workId: uuidSchema,
  date: isoDateSchema,
  qty: qtySchema.positive(),
  place: z.string().trim().max(80).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type WorkMeasureInput = z.infer<typeof workMeasureSchema>;

/** qty × rate, rounded to the paisa. */
export const measureAmount = (qty: number, ratePaise: Paise): Paise => Math.round(qty * ratePaise);

export interface MeasureRow { workId: string; qty: number; ratePaise: Paise }
export interface WorkLine { workId: string; qty: number; amount: Paise }

/** Measured work grouped per kind of work, with its value. */
export function workTotals(measures: MeasureRow[]): { lines: WorkLine[]; gross: Paise } {
  const by = new Map<string, WorkLine>();
  for (const m of measures) {
    const line = by.get(m.workId) ?? { workId: m.workId, qty: 0, amount: 0 };
    line.qty = Math.round((line.qty + m.qty) * 1000) / 1000;
    line.amount += measureAmount(m.qty, m.ratePaise);
    by.set(m.workId, line);
  }
  const lines = [...by.values()];
  return { lines, gross: lines.reduce((s, l) => s + l.amount, 0) };
}

/**
 * One contractor's bill: attendance wages (only if paid by the day) + measured work − upad.
 * A contractor paid by measurement may still be marked in attendance (head count); those days are not paid.
 */
export function contractorBill(attendance: WageResult, byDay: boolean, workGross: Paise): WageResult & { attendanceGross: Paise; workGross: Paise } {
  const attendanceGross = byDay ? attendance.gross : 0;
  const gross = attendanceGross + workGross;
  return {
    ...attendance,
    missingRates: byDay ? attendance.missingRates : [],
    gross,
    net: gross - attendance.advances,
    attendanceGross,
    workGross,
  };
}
