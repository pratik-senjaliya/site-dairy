// Business dates are ISO YYYY-MM-DD in Asia/Kolkata, whatever the server or phone clock zone is.

export const APP_TIMEZONE = 'Asia/Kolkata';

const isoDay = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

export function isoDate(at: Date = new Date()): string {
  return isoDay.format(at);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of days between two ISO dates. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 0 = Sunday … 6 = Saturday, for an ISO date. */
export const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/**
 * The wage week holding `date`: seven days ending on the company's wage day (default Saturday).
 * `weeksBack` 1 is the week before, already due for payment.
 */
export function wageWeek(date: string, wageDay: number, weeksBack = 0): { from: string; to: string } {
  const to = addDays(date, ((wageDay - weekday(date) + 7) % 7) - 7 * weeksBack);
  return { from: addDays(to, -6), to };
}

/** "2026-10-18" → "18/10", the way dates are written on site. */
export const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
