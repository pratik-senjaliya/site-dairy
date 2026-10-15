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
