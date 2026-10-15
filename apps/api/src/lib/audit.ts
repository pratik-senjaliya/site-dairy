import type { Me } from './auth';
import type { Tx } from './db';
import { toPlain } from './json';

export interface AuditEntry {
  action: string; // create | update | delete | approve | reject | login | ...
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Who and where, taken from the request. */
export interface Actor {
  me: Pick<Me, 'id' | 'companyId'> & { deviceId?: string | null };
  ip?: string | null;
}

// Append-only: the database refuses UPDATE and DELETE on audit_log.
export async function audit(tx: Tx, actor: Actor, entries: AuditEntry | AuditEntry[]) {
  const list = Array.isArray(entries) ? entries : [entries];
  if (!list.length) return;
  await tx.auditLog.createMany({
    data: list.map((e) => ({
      companyId: actor.me.companyId,
      userId: actor.me.id,
      deviceId: actor.me.deviceId ?? null,
      ip: actor.ip ?? null,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      before: toPlain(e.before),
      after: toPlain(e.after),
    })),
  });
}
