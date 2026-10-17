import { addDays, isoDate, parseSettings } from '@site-diary/shared';
import PgBoss from 'pg-boss';
import { config } from './lib/config';
import { notify, recipients } from './lib/notify';
import { prisma, transaction } from './lib/prisma';
import { runNightlyFor } from './modules/reports/nightly';

// Background work on pg-boss (Postgres; no Redis). One "tick" every 5 minutes looks at each company's
// own times (Asia/Kolkata) and queues what is due. Each queued job retries 3 times; a final failure
// notifies the owner.

const nowHHMM = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
const weekday = () => new Date(`${isoDate()}T12:00:00+05:30`).getUTCDay();
const plus = (hhmm: string, minutes: number) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const t = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

export async function tick() {
  const today = isoDate();
  const now = nowHHMM();
  const companies = await prisma.company.findMany({ where: { deletedAt: null } });
  const due: { userId: string; date: string }[] = [];

  // Attendance locks at midnight (the lock rule itself is checked on every write; this flag is for display).
  await prisma.attendanceEntry.updateMany({ where: { locked: false, date: { lt: new Date(`${today}T00:00:00Z`) } }, data: { locked: true } });

  for (const c of companies) {
    const cfg = parseSettings(c.settings);
    const sites = await prisma.project.findMany({ where: { companyId: c.id, deletedAt: null, status: 'active' } });

    // No entry by the cutoff: supervisors first, the engineer 30 minutes later.
    for (const [roles, at] of [[['supervisor'], cfg.noEntryCutoff], [['engineer'], plus(cfg.noEntryCutoff, 30)]] as const) {
      if (now < at) continue;
      for (const s of sites) {
        const [entries, day] = await Promise.all([
          prisma.attendanceEntry.count({ where: { projectId: s.id, date: new Date(`${today}T00:00:00Z`), deletedAt: null } }),
          prisma.siteDay.findFirst({ where: { projectId: s.id, date: new Date(`${today}T00:00:00Z`), deletedAt: null } }),
        ]);
        if (entries || (day && day.marker !== 'work')) continue;
        await transaction(async (tx) =>
          notify(tx, c.id, await recipients(tx, c.id, [...roles], s.id), {
            kind: 'no_entry', title: `No attendance yet at ${s.name}`, body: `Please enter today's attendance (${at})`, entityType: 'project', entityId: s.id,
            dedupeKey: `noentry:${roles[0]}:${s.id}:${today}`,
          }),
        );
      }
    }

    // Weekly wage settlement reminder on the company's wage day.
    if (weekday() === cfg.wageDay && now >= '10:00') {
      await transaction(async (tx) =>
        notify(tx, c.id, await recipients(tx, c.id, ['accountant', 'owner']), {
          kind: 'wages_due', title: 'Weekly wage settlement is due', body: `For ${addDays(today, -6)} to ${today}`, dedupeKey: `wages:${today}`,
        }),
      );
    }

    // Nightly report at the company's report time, for the owner(s) and each engineer.
    if (now >= cfg.reportTime) {
      const people = await prisma.user.findMany({ where: { companyId: c.id, isActive: true, deletedAt: null, role: { in: ['owner', 'engineer'] } } });
      for (const p of people) {
        const sent = await prisma.report.findUnique({ where: { userId_date_channel: { userId: p.id, date: new Date(`${today}T00:00:00Z`), channel: 'in_app' } } });
        if (!sent?.sentAt) due.push({ userId: p.id, date: today });
      }
    }
  }
  return due;
}

let boss: PgBoss | undefined;

export async function startJobs() {
  if (!config.runJobs) return;
  boss = new PgBoss({ connectionString: config.directUrl, schema: 'pgboss' });
  boss.on('error', (e: Error) => console.error('jobs:', e.message));
  await boss.start();
  await boss.createQueue('tick');
  await boss.createQueue('nightly-report');
  await boss.schedule('tick', '*/5 * * * *', {}, { tz: 'Asia/Kolkata' });

  await boss.work('tick', async () => {
    const due = await tick();
    for (const d of due) await boss!.send('nightly-report', d, { singletonKey: `${d.userId}:${d.date}`, retryLimit: 3, retryDelay: 120, retryBackoff: true });
  });
  await boss.work<{ userId: string; date: string }>('nightly-report', async ([job]: PgBoss.Job<{ userId: string; date: string }>[]) => {
    if (!job) return;
    try {
      await runNightlyFor(job.data.userId, job.data.date);
    } catch (e) {
      // pg-boss retries; after the last attempt, tell the owner so it never fails silently.
      const attempts = (job as unknown as { retryCount?: number }).retryCount ?? 0;
      if (attempts >= 3) {
        const user = await prisma.user.findUnique({ where: { id: job.data.userId } });
        if (user) {
          await transaction(async (tx) =>
            notify(tx, user.companyId, await recipients(tx, user.companyId, ['owner']), {
              kind: 'report_failed', title: 'Tonight’s report could not be made', body: e instanceof Error ? e.message : String(e), dedupeKey: `reportfail:${job.data.date}:${user.id}`,
            }),
          );
        }
      }
      throw e;
    }
  });
  console.log('jobs: started (tick every 5 minutes)');
}

export async function stopJobs() {
  await boss?.stop({ graceful: true });
}
