import { transaction, type Tx } from './prisma';

export type { Tx };

// Every write to synced tables goes through here. The per-company lock makes writes of one company
// commit in server_rev order, so a sync pull (which takes the same lock to read the high-water mark)
// can never skip a row whose transaction was still open. Pilot companies write a few rows a minute.
export function write<T>(companyId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}))`;
      return fn(tx);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

/** Highest server_rev that is safe to hand to a client for this company. */
export async function highWaterMark(companyId: string): Promise<bigint> {
  return write(companyId, async (tx) => {
    const [row] = await tx.$queryRaw<{ last_value: bigint }[]>`SELECT last_value FROM server_rev_seq`;
    return row?.last_value ?? 0n;
  });
}
