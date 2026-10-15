import type { Paise } from './money';

export interface AttendanceLine {
  skillId: string;
  /** Full-day workers. */
  count: number;
  /** Workers who worked half a day. */
  halfDayCount: number;
  otHours: number;
}

export interface WageInput {
  attendance: AttendanceLine[];
  /** Daily rate per skill, in paise. */
  dailyRates: Record<string, Paise>;
  /** Overtime is paid per hour as dailyRate / hoursPerDay. */
  hoursPerDay?: number;
  advances: Paise;
}

export interface WageResult {
  manDays: number;
  gross: Paise;
  advances: Paise;
  /** May be negative when advances exceed earnings; the balance carries to the next settlement. */
  net: Paise;
  missingRates: string[];
}

/** days × rate − advances = payable (scope: Contractors and labour). */
export function settleWages({ attendance, dailyRates, hoursPerDay = 8, advances }: WageInput): WageResult {
  let manDays = 0;
  let gross = 0;
  const missing = new Set<string>();
  for (const line of attendance) {
    const days = line.count + line.halfDayCount / 2;
    manDays += days;
    const rate = dailyRates[line.skillId];
    if (rate === undefined) {
      missing.add(line.skillId);
      continue;
    }
    gross += Math.round(days * rate + (line.otHours * rate) / hoursPerDay);
  }
  return { manDays, gross, advances, net: gross - advances, missingRates: [...missing] };
}

export interface RateRow {
  skillId: string;
  dailyRatePaise: Paise;
  /** YYYY-MM-DD */
  effectiveFrom: string;
}

/** The rate in force on a date: the latest effective_from on or before it. */
export function rateOn(rates: RateRow[], skillId: string, date: string): Paise | undefined {
  let best: RateRow | undefined;
  for (const r of rates) {
    if (r.skillId === skillId && r.effectiveFrom <= date && (!best || r.effectiveFrom > best.effectiveFrom)) best = r;
  }
  return best?.dailyRatePaise;
}

/** A settlement period: each day is paid at the rate in force that day. */
export function settlePeriod(entries: (AttendanceLine & { date: string })[], rates: RateRow[], advances: Paise, hoursPerDay = 8): WageResult {
  const byDate = new Map<string, AttendanceLine[]>();
  for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const total: WageResult = { manDays: 0, gross: 0, advances, net: 0, missingRates: [] };
  const missing = new Set<string>();
  for (const [date, attendance] of byDate) {
    const dailyRates: Record<string, Paise> = {};
    for (const a of attendance) {
      const rate = rateOn(rates, a.skillId, date);
      if (rate !== undefined) dailyRates[a.skillId] = rate;
    }
    const r = settleWages({ attendance, dailyRates, hoursPerDay, advances: 0 });
    total.manDays += r.manDays;
    total.gross += r.gross;
    r.missingRates.forEach((s) => missing.add(s));
  }
  total.missingRates = [...missing];
  total.net = total.gross - advances;
  return total;
}
