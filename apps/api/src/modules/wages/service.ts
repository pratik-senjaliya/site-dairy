import { contractorBill, paysByDay, settlePeriod, workTotals, type RateRow, type WageResult } from '@site-diary/shared';
import type { Tx } from '../../lib/db';
import { day, isoOf } from '../../lib/json';
import { prisma } from '../../lib/prisma';

export interface WagePreview extends WageResult {
  advanceIds: string[];
  /** Measurements billed with this period: every one not yet billed, measured on or before the period end. */
  measureIds: string[];
  days: { date: string; skillId: string; count: number; halfDayCount: number; otHours: number }[];
  /** Per skill, for the contractor's hisab: man-days, overtime and earnings at the rates in force. */
  bySkill: { skillId: string; manDays: number; otHours: number; gross: number }[];
  /** Measured work per kind of work: total quantity and value. */
  work: { workId: string; name: string; unit: string; qty: number; amount: number }[];
  /** False for a contractor paid by measurement: his attendance is head count, not wages. */
  byDay: boolean;
  attendanceGross: number;
  workGross: number;
}

/** Attendance × rates in force each day (contractors paid by the day) + measured work − upad not yet settled. */
export async function previewWages(db: Tx | typeof prisma, projectId: string, contractorId: string, from: string, to: string): Promise<WagePreview> {
  const [contractor, entries, rates, advances, measures] = await Promise.all([
    db.contractor.findUnique({ where: { id: contractorId }, select: { rateType: true } }),
    db.attendanceEntry.findMany({ where: { projectId, contractorId, deletedAt: null, date: { gte: day(from), lte: day(to) } }, orderBy: { date: 'asc' } }),
    db.contractorRate.findMany({ where: { contractorId, deletedAt: null } }),
    db.advance.findMany({ where: { projectId, contractorId, deletedAt: null, settlementId: null, date: { lte: day(to) } } }),
    db.workMeasure.findMany({ where: { projectId, contractorId, deletedAt: null, settlementId: null, date: { lte: day(to) } } }),
  ]);
  const byDay = paysByDay(contractor?.rateType);
  const days = entries.map((e) => ({ date: isoOf(e.date), skillId: e.skillId, count: e.count, halfDayCount: e.halfDayCount, otHours: e.otHours.toNumber() }));
  const rateRows: RateRow[] = rates.map((r) => ({ skillId: r.skillId, dailyRatePaise: Number(r.dailyRatePaise), effectiveFrom: isoOf(r.effectiveFrom) }));
  const advancePaise = advances.reduce((s, a) => s + Number(a.amountPaise), 0);
  const totals = workTotals(measures.map((x) => ({ workId: x.workId, qty: x.qty.toNumber(), ratePaise: Number(x.ratePaise) })));
  const works = totals.lines.length ? await db.contractWork.findMany({ where: { id: { in: totals.lines.map((l) => l.workId) } } }) : [];
  const result = contractorBill(settlePeriod(days, rateRows, advancePaise), byDay, totals.gross);
  const bySkill = [...new Set(days.map((d) => d.skillId))].map((skillId) => {
    const mine = days.filter((d) => d.skillId === skillId);
    const r = settlePeriod(mine, rateRows, 0);
    return { skillId, manDays: r.manDays, otHours: mine.reduce((s, d) => s + d.otHours, 0), gross: byDay ? r.gross : 0 };
  });
  const work = totals.lines.map((l) => {
    const w = works.find((x) => x.id === l.workId);
    return { workId: l.workId, name: w?.name ?? '', unit: w?.unit ?? '', qty: l.qty, amount: l.amount };
  });
  return { ...result, advanceIds: advances.map((a) => a.id), measureIds: measures.map((x) => x.id), days, bySkill, work, byDay };
}
