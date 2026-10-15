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
