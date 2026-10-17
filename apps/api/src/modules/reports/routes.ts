import { isoDate, isoDateSchema, uuidSchema } from '@site-diary/shared';
import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { assertCan, assertSite, me } from '../../lib/auth';
import { HttpError } from '../../lib/errors';
import { prisma, transaction } from '../../lib/prisma';
import { param, query } from '../../lib/validate';
import { toPdf, toXlsx } from './export';
import { reportLink, runNightlyFor } from './nightly';
import { buildReport, REPORT_TYPES, type Report, type ReportType } from './report';

export const reports = Router();

export async function sendReport(res: import('express').Response, r: Report, format: 'json' | 'xlsx' | 'pdf', filename: string) {
  if (format === 'json') {
    res.json(r);
    return;
  }
  const buf = format === 'xlsx' ? await toXlsx(r) : await toPdf(r);
  res
    .type(format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf')
    .set('content-disposition', `${format === 'pdf' ? 'inline' : 'attachment'}; filename="${filename}.${format}"`)
    .send(buf);
}

// M15: my nightly reports, newest first, each with its share link.
reports.get('/nightly/history', async (req, res) => {
  const m = me(req);
  const rows = await prisma.report.findMany({ where: { userId: m.id, channel: 'in_app' }, orderBy: { date: 'desc' }, take: 60 });
  res.json(rows.map((r) => ({ id: r.id, date: r.date, sentAt: r.sentAt, link: reportLink(r.id) })));
});

// "Send now" (owner/engineer): builds tonight's report immediately.
reports.post('/nightly/run', async (req, res) => {
  const m = me(req);
  if (m.role !== 'owner' && m.role !== 'engineer') throw new HttpError(403, 'Only owners and engineers get the nightly report', 'forbidden');
  await prisma.report.deleteMany({ where: { userId: m.id, date: new Date(`${isoDate()}T00:00:00Z`), channel: 'in_app' } });
  const row = await runNightlyFor(m.id);
  res.json(row ? { id: row.id, link: reportLink(row.id) } : { id: null });
});

// W10: GET /reports/:type?projectId=<id|all>&from&to&format=json|xlsx|pdf
reports.get('/:type', async (req, res) => {
  const m = me(req);
  const type = param(req, 'type') as ReportType;
  if (!REPORT_TYPES.includes(type)) throw new HttpError(404, 'Unknown report', 'not_found');
  // The daily site report is for everyone on the site (supervisors send it); the rest are office reports.
  if (type !== 'daily') assertCan(m, 'reports', 'V');
  const today = isoDate();
  const q = query(
    z.object({
      projectId: z.union([uuidSchema, z.literal('all')]).default('all'),
      from: isoDateSchema.default(today),
      to: isoDateSchema.default(today),
      supplierId: uuidSchema.optional(),
      format: z.enum(['json', 'xlsx', 'pdf']).default('json'),
      lang: z.enum(['gu', 'en', 'hi']).optional(),
    }).refine((x) => x.from <= x.to, 'Start date is after the end date'),
    req,
  );
  let projectIds: string[];
  if (q.projectId === 'all') {
    projectIds = (await prisma.project.findMany({ where: { companyId: m.companyId, deletedAt: null, ...(m.sites !== 'all' && { id: { in: m.sites } }), ...(type === 'daily' && { status: 'active' }) }, select: { id: true } })).map((p) => p.id);
  } else {
    assertSite(m, q.projectId);
    projectIds = [q.projectId];
  }
  const r = await buildReport(type, { companyId: m.companyId, projectIds, from: q.from, to: q.to, supplierId: q.supplierId, locale: q.lang ?? m.language });
  if (q.format !== 'json') {
    await transaction((tx) => audit(tx, { me: m, ip: req.ip }, { action: 'export', entityType: 'report', entityId: null, after: { type, format: q.format, from: q.from, to: q.to, projectIds } }));
  }
  await sendReport(res, r, q.format, `${type}-${q.to}`);
});
