import type { Role } from '@site-diary/shared';
import type { Tx } from './db';
import { prisma } from './prisma';

export interface Notice {
  kind: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  dedupeKey?: string;
}

/** Users of these roles who can see this site (owner/accountant see every site). */
export async function recipients(tx: Tx, companyId: string, roles: Role[], projectId?: string | null): Promise<string[]> {
  const users = await tx.user.findMany({
    where: {
      companyId, isActive: true, deletedAt: null, role: { in: roles },
      ...(projectId && {
        OR: [{ role: { in: ['owner', 'accountant'] } }, { sites: { some: { projectId, deletedAt: null } } }],
      }),
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export async function notify(tx: Tx, companyId: string, userIds: string[], n: Notice) {
  if (!userIds.length) return;
  await tx.notification.createMany({
    data: [...new Set(userIds)].map((userId) => ({ companyId, userId, ...n })),
    skipDuplicates: true, // dedupeKey
  });
  queuePush(userIds, n);
}

// Expo push for phones that registered a token (development/production builds; Expo Go on Android has none).
function queuePush(userIds: string[], n: Notice) {
  setImmediate(async () => {
    try {
      const tokens = await prisma.pushToken.findMany({ where: { userId: { in: userIds } } });
      if (!tokens.length) return;
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(tokens.map((t) => ({ to: t.token, title: n.title, body: n.body, data: { entityType: n.entityType, entityId: n.entityId } }))),
      });
    } catch (e) {
      console.warn('push failed', e instanceof Error ? e.message : e);
    }
  });
}
