import { settlePeriod, type WageResult } from '@site-diary/shared';
import type { Tx } from '../../lib/db';
import { day, isoOf } from '../../lib/json';
import { prisma } from '../../lib/prisma';

export interface WagePreview extends WageResult {
  advanceIds: string[];
  days: { date: string; skillId: string; count: number; halfDayCount: number; otHours: number }[];
}

/** Attendance × rates in force each day − advances not yet settled (given on or before the period end). */
export async function previewWages(db: Tx | typeof prisma, projectId: string, contractorId: string, from: string, to: string): Promise<WagePreview> {
  const [entries, rates, advances] = await Promise.all([
    db.attendanceEntry.findMany({ where: { projectId, contractorId, deletedAt: null, date: { gte: day(from), lte: day(to) } }, orderBy: { date: 'asc' } }),
    db.contractorRate.findMany({ where: { contractorId, deletedAt: null } }),
    db.advance.findMany({ where: { projectId, contractorId, deletedAt: null, settlementId: null, date: { lte: day(to) } } }),
  ]);
  const days = entries.map((e) => ({ date: isoOf(e.date), skillId: e.skillId, count: e.count, halfDayCount: e.halfDayCount, otHours: e.otHours.toNumber() }));
  const advancePaise = advances.reduce((s, a) => s + Number(a.amountPaise), 0);
  const result = settlePeriod(
    days,
    rates.map((r) => ({ skillId: r.skillId, dailyRatePaise: Number(r.dailyRatePaise), effectiveFrom: isoOf(r.effectiveFrom) })),
    advancePaise,
  );
  return { ...result, advanceIds: advances.map((a) => a.id), days };
}
