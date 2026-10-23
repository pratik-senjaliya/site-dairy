import { addDays } from '@site-diary/shared';
import { useOnline } from './hooks';

/** One site's month from the server's monthly report (the CA's summary): what labour and material cost, what was paid. */
export interface MonthRow { site: string; manDays: number | null; labourCost: number | null; material: number | null; wagesPaid: number | null; advances: number | null; supplierPaid: number | null }

/** This month so far (back = 0) or the whole of last month (back = 1). */
export function monthRange(today: string, back: 0 | 1) {
  const start = `${today.slice(0, 8)}01`;
  if (!back) return { from: start, to: today };
  const to = addDays(start, -1);
  return { from: `${to.slice(0, 8)}01`, to };
}

export function useMonth(projectId: string | null, from: string, to: string) {
  const r = useOnline<{ tables: { rows: MonthRow[] }[] }>(projectId ? `/reports/monthly?projectId=${projectId}&from=${from}&to=${to}` : null);
  return { ...r, rows: r.data?.tables[0]?.rows ?? null };
}
