import { isoDate } from '@site-diary/shared';
import jwt from 'jsonwebtoken';
import { config } from '../../lib/config';
import { notify } from '../../lib/notify';
import { prisma, transaction } from '../../lib/prisma';
import { putFile } from '../../lib/storage';
import { toPdf } from './export';
import { buildReport } from './report';

/** Public link to one report (no sign-in): what the WhatsApp message carries. Valid 30 days. */
export const reportLink = (reportId: string) =>
  `${config.publicWebUrl.replace(/\/$/, '')}/r/${jwt.sign({ rid: reportId }, config.jwtSecret, { expiresIn: '30d', audience: 'report' })}`;

export function readReportToken(token: string): string | null {
  try {
    return (jwt.verify(token, config.jwtSecret, { audience: 'report' }) as { rid?: string }).rid ?? null;
  } catch {
    return null;
  }
}

// Owner: all active sites in one report. Engineer: their own sites.
export async function runNightlyFor(userId: string, date = isoDate()) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { sites: { where: { deletedAt: null } } } });
  const existing = await prisma.report.findUnique({ where: { userId_date_channel: { userId, date: new Date(`${date}T00:00:00Z`), channel: 'in_app' } } });
  if (existing?.sentAt) return existing;
  const projectIds = (
    await prisma.project.findMany({
      where: { companyId: user.companyId, deletedAt: null, status: 'active', ...(user.role !== 'owner' && { id: { in: user.sites.map((s) => s.projectId) } }) },
      select: { id: true },
    })
  ).map((p) => p.id);
  if (!projectIds.length) return null;

  const report = await buildReport('daily', { companyId: user.companyId, projectIds, from: date, to: date, locale: user.language });
  const pdf = await toPdf(report);
  const pdfKey = `${user.companyId}/reports/${date}/${user.id}.pdf`;
  await putFile(pdfKey, pdf, 'application/pdf');
  const row = await prisma.report.upsert({
    where: { userId_date_channel: { userId, date: new Date(`${date}T00:00:00Z`), channel: 'in_app' } },
    create: { companyId: user.companyId, userId, date: new Date(`${date}T00:00:00Z`), channel: 'in_app', pdfKey, sentAt: new Date() },
    update: { pdfKey, sentAt: new Date(), error: null },
  });
  const link = reportLink(row.id);
  const workers = report.highlights[0]?.value ?? '';
  await transaction((tx) =>
    notify(tx, user.companyId, [user.id], {
      kind: 'nightly_report', title: { key: 'notify.nightly', vars: { date } }, body: `${report.subtitle} · ${workers}`, entityType: 'report', entityId: row.id, dedupeKey: `nightly:${date}`,
    }),
  );
  await sendWhatsApp(user.companyId, user.id, user.phone, user.name, date, link).catch((e: unknown) => console.warn('whatsapp failed', e instanceof Error ? e.message : e));
  return row;
}

/**
 * WhatsApp Cloud API template message (needs an approved template with three body parameters:
 * name, date, link). Without WHATSAPP_TOKEN the report stays in-app and the phone shares the PDF.
 */
async function sendWhatsApp(companyId: string, userId: string, phone: string, name: string, date: string, link: string) {
  const w = config.whatsapp;
  if (!w.token || !w.phoneNumberId) return;
  const res = await fetch(`https://graph.facebook.com/v21.0/${w.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${w.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: w.template,
        language: { code: w.templateLanguage },
        components: [{ type: 'body', parameters: [{ type: 'text', text: name }, { type: 'text', text: date }, { type: 'text', text: link }] }],
      },
    }),
  });
  const ok = res.ok;
  await prisma.report.upsert({
    where: { userId_date_channel: { userId, date: new Date(`${date}T00:00:00Z`), channel: 'whatsapp' } },
    create: { companyId, userId, date: new Date(`${date}T00:00:00Z`), channel: 'whatsapp', sentAt: ok ? new Date() : null, error: ok ? null : await res.text() },
    update: { sentAt: ok ? new Date() : null, error: ok ? null : await res.text() },
  });
}
