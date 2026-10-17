import { Router } from 'express';
import { HttpError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { readLocal, signedUrl } from '../../lib/storage';
import { param } from '../../lib/validate';
import { poPdf, readPoToken } from '../purchase/poPdf';
import { readReportToken } from './nightly';
import { buildReport } from './report';

// The link in the WhatsApp message: no sign-in, the signed token is the permission (30 days, one report).
export const publicReports = Router();

async function reportOf(token: string) {
  const id = readReportToken(token);
  const row = id ? await prisma.report.findUnique({ where: { id } }) : null;
  if (!row) throw new HttpError(404, 'This report link has expired', 'expired');
  return row;
}

publicReports.get('/:token', async (req, res) => {
  const row = await reportOf(param(req, 'token'));
  const user = await prisma.user.findUniqueOrThrow({ where: { id: row.userId }, include: { sites: { where: { deletedAt: null } } } });
  const projectIds = (
    await prisma.project.findMany({ where: { companyId: row.companyId, deletedAt: null, status: 'active', ...(user.role !== 'owner' && { id: { in: user.sites.map((s) => s.projectId) } }) }, select: { id: true } })
  ).map((p) => p.id);
  const date = row.date.toISOString().slice(0, 10);
  const report = await buildReport('daily', { companyId: row.companyId, projectIds, from: date, to: date, locale: user.language });
  res.json({ ...report, photos: undefined, language: user.language });
});

publicReports.get('/:token/pdf', async (req, res) => {
  const row = await reportOf(param(req, 'token'));
  if (!row.pdfKey) throw new HttpError(404, 'PDF not ready', 'pending');
  const url = await signedUrl(row.pdfKey);
  if (url) {
    res.redirect(url);
    return;
  }
  res.type('application/pdf').set('content-disposition', `inline; filename="site-report-${row.date.toISOString().slice(0, 10)}.pdf"`).send(await readLocal(row.pdfKey));
});

// The PO link sent to a supplier.
export const publicPo = Router();
publicPo.get('/:token', async (req, res) => {
  const t = readPoToken(param(req, 'token'));
  if (!t) throw new HttpError(404, 'This link has expired', 'expired');
  const { pdf, poNo } = await poPdf(t.cid, t.po);
  res.type('application/pdf').set('content-disposition', `inline; filename="${poNo}.pdf"`).send(pdf);
});
