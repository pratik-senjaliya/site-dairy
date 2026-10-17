import { Prisma, PrismaClient } from '@prisma/client';
import { currentCompany } from './context';

// Every query runs with the Postgres settings the row-level-security policies read (migration
// 20261017000000_row_level_security): the request's company, or "system" outside a request.
// Model calls on `prisma` are wrapped automatically; interactive transactions use `transaction()`.

export const base = new PrismaClient();

let appRole: boolean | null = null;
async function hasAppRole() {
  appRole ??= ((await base.$queryRaw<{ ok: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'site_app') AS ok`)[0]?.ok ?? false);
  return appRole;
}

export async function rlsSettings(companyId: string | null = currentCompany()) {
  const role = (await hasAppRole()) ? 'site_app' : '';
  return Prisma.sql`SELECT set_config('app.rls', ${companyId ? 'tenant' : 'system'}, true),
    set_config('app.company_id', ${companyId ?? ''}, true)
    ${role ? Prisma.sql`, set_config('role', ${role}, true)` : Prisma.empty}`;
}

export const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const [, result] = await base.$transaction([base.$executeRaw(await rlsSettings()), query(args)]);
        return result;
      },
    },
  },
});

export type Tx = Prisma.TransactionClient;

/** Interactive transaction with the same settings (its client talks to the database directly). */
export function transaction<T>(fn: (tx: Tx) => Promise<T>, opts?: { timeout?: number; maxWait?: number }): Promise<T> {
  return base.$transaction(async (tx) => {
    await tx.$executeRaw(await rlsSettings());
    return fn(tx);
  }, opts);
}
