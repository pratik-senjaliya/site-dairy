import { t, type Locale, type MessageKey } from '@site-diary/i18n';
import type { Role } from '@site-diary/shared';
import type { Tx } from './db';
import { prisma } from './prisma';

/** Text written in each recipient's own language: a message key with values, or a plain string (names, numbers). */
export type Var = string | number | { gu: string; en: string; hi?: string } | Msg;
export type Msg = string | { key: MessageKey; vars?: Record<string, Var> };

export interface Notice {
  kind: string;
  title: Msg;
  body?: Msg;
  entityType?: string;
  entityId?: string;
  /** Same key = same notice; stops repeats (e.g. one low-stock alert per material per day). */
  dedupeKey?: string;
}

export function render(lang: Locale, m: Var | undefined): string {
  if (m === undefined) return '';
  if (typeof m === 'string' || typeof m === 'number') return String(m);
  if ('key' in m) return t(lang, m.key, Object.fromEntries(Object.entries(m.vars ?? {}).map(([k, v]) => [k, render(lang, v)])));
  return lang === 'en' ? m.en : lang === 'hi' ? (m.hi ?? m.en) : m.gu;
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
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  const users = await tx.user.findMany({ where: { id: { in: ids }, companyId }, select: { id: true, language: true } });
  const rows = users.map((u) => ({
    companyId, userId: u.id, kind: n.kind, title: render(u.language, n.title), body: n.body === undefined ? null : render(u.language, n.body),
    entityType: n.entityType, entityId: n.entityId, dedupeKey: n.dedupeKey,
  }));
  await tx.notification.createMany({ data: rows, skipDuplicates: true });
  queuePush(rows.map((r) => ({ userId: r.userId, title: r.title, body: r.body })), n);
}

// Expo push for phones that registered a token (installed builds; Expo Go on Android has none).
function queuePush(messages: { userId: string; title: string; body: string | null }[], n: Notice) {
  setImmediate(async () => {
    try {
      const tokens = await prisma.pushToken.findMany({ where: { userId: { in: messages.map((m) => m.userId) } } });
      if (!tokens.length) return;
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(tokens.map((tk) => {
          const m = messages.find((x) => x.userId === tk.userId)!;
          return { to: tk.token, title: m.title, body: m.body ?? undefined, sound: 'default', data: { kind: n.kind, entityType: n.entityType, entityId: n.entityId } };
        })),
      });
    } catch (e) {
      console.warn('push failed', e instanceof Error ? e.message : e);
    }
  });
}
