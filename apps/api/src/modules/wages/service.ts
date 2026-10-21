import { settlePeriod, type RateRow, type WageResult } from '@site-diary/shared';
import type { Tx } from '../../lib/db';
import { day, isoOf } from '../../lib/json';
import { prisma } from '../../lib/prisma';

export interface WagePreview extends WageResult {
  advanceIds: string[];
  days: { date: string; skillId: string; count: number; halfDayCount: number; otHours: number }[];
  /** Per skill, for the contractor's hisab: man-days, overtime and earnings at the rates in force. */
  bySkill: { skillId: string; manDays: number; otHours: number; gross: number }[];
}

/** Attendance × rates in force each day − advances not yet settled (given on or before the period end). */
export async function previewWages(db: Tx | typeof prisma, projectId: string, contractorId: string, from: string, to: string): Promise<WagePreview> {
  const [entries, rates, advances] = await Promise.all([
    db.attendanceEntry.findMany({ where: { projectId, contractorId, deletedAt: null, date: { gte: day(from), lte: day(to) } }, orderBy: { date: 'asc' } }),
    db.contractorRate.findMany({ where: { contractorId, deletedAt: null } }),
    db.advance.findMany({ where: { projectId, contractorId, deletedAt: null, settlementId: null, date: { lte: day(to) } } }),
  ]);
  const days = entries.map((e) => ({ date: isoOf(e.date), skillId: e.skillId, count: e.count, halfDayCount: e.halfDayCount, otHours: e.otHours.toNumber() }));
  const rateRows: RateRow[] = rates.map((r) => ({ skillId: r.skillId, dailyRatePaise: Number(r.dailyRatePaise), effectiveFrom: isoOf(r.effectiveFrom) }));
  const advancePaise = advances.reduce((s, a) => s + Number(a.amountPaise), 0);
  const result = settlePeriod(days, rateRows, advancePaise);
  const bySkill = [...new Set(days.map((d) => d.skillId))].map((skillId) => {
    const mine = days.filter((d) => d.skillId === skillId);
    const r = settlePeriod(mine, rateRows, 0);
    return { skillId, manDays: r.manDays, otHours: mine.reduce((s, d) => s + d.otHours, 0), gross: r.gross };
  });
  return { ...result, advanceIds: advances.map((a) => a.id), days, bySkill };
}
