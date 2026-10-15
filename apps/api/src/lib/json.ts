import { Prisma } from '@prisma/client';

// DATE columns arrive from Prisma as Date at UTC midnight; send them as YYYY-MM-DD.
const DATE_ONLY = new Set(['date', 'startDate', 'endDate', 'effectiveFrom', 'periodFrom', 'periodTo', 'neededBy']);

/** JSON.stringify replacer for responses: BigInt paise and Decimal quantities become numbers. */
export function jsonReplacer(this: Record<string, unknown>, key: string, value: unknown): unknown {
  const raw = this[key];
  if (typeof raw === 'bigint') return Number(raw);
  if (Prisma.Decimal.isDecimal(raw)) return (raw as Prisma.Decimal).toNumber();
  if (raw instanceof Date && DATE_ONLY.has(key)) return raw.toISOString().slice(0, 10);
  return value;
}

/** Plain JSON (for JSONB columns and the audit log). */
export const toPlain = (value: unknown): Prisma.InputJsonValue | undefined =>
  value == null ? undefined : (JSON.parse(JSON.stringify(value, jsonReplacer)) as Prisma.InputJsonValue);

export const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const isoOf = (d: Date) => d.toISOString().slice(0, 10);
