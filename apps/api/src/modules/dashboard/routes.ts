import { can, isoDate, isoDateSchema, parseSettings } from '@site-diary/shared';
import { Router } from 'express';
import { z } from 'zod';
import { me, siteOrCompanyWide } from '../../lib/auth';
import { prisma } from '../../lib/prisma';
import { query } from '../../lib/validate';
import { siteDaySummary, type SiteDaySummary } from '../reports/daily';

export const dashboard = Router();

/** Labour cost comes from contractor rates, which only roles that see wages may read. */
function withoutCost(role: Parameters<typeof can>[0], s: SiteDaySummary): SiteDaySummary {
  return can(role, 'wages', 'V') ? s : { ...s, labour: { ...s.labour, costPaise: 0, costMissingRates: false } };
}

const nowHHMM = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

// W1 / M12: today across the sites this person can see.
dashboard.get('/', async (req, res) => {
  const m = me(req);
  const { date } = query(z.object({ date: isoDateSchema.optional() }), req);
  const d = date ?? isoDate();
  const company = await prisma.company.findUniqueOrThrow({ where: { id: m.companyId } });
  const cfg = parseSettings(company.settings);
  const projects = await prisma.project.findMany({
    where: { companyId: m.companyId, deletedAt: null, status: 'active', ...(m.sites !== 'all' && { id: { in: m.sites } }) },
    orderBy: { name: 'asc' },
  });
  const sites = (await Promise.all(projects.map((p) => siteDaySummary(m.companyId, p.id, d)))).map((s) => withoutCost(m.role, s));
  const afterCutoff = d < isoDate() || nowHHMM() >= cfg.noEntryCutoff;
  for (const s of sites) {
    if (afterCutoff && s.missing.includes('attendance')) s.alerts.unshift(`No attendance entered by ${cfg.noEntryCutoff}`);
  }
  const pendingApprovals = await prisma.approval.count({ where: { companyId: m.companyId, status: 'pending', deletedAt: null, ...siteOrCompanyWide(m) } });
  res.json({
    date: d,
    totals: {
      workers: sites.reduce((s, x) => s + x.labour.workers, 0),
      yesterday: sites.reduce((s, x) => s + x.labour.yesterday, 0),
      labourCostPaise: sites.reduce((s, x) => s + x.labour.costPaise, 0),
      grnLines: sites.reduce((s, x) => s + x.materialIn.length, 0),
      issues: sites.reduce((s, x) => s + x.materialUsed.length, 0),
      photos: sites.reduce((s, x) => s + x.photos.length, 0),
      sitesMissingEntry: sites.filter((x) => x.missing.includes('attendance')).length,
      pendingApprovals,
    },
    sites,
  });
});

dashboard.get('/site/:id', async (req, res) => {
  const m = me(req);
  const id = String(req.params.id);
  if (m.sites !== 'all' && !m.sites.includes(id)) {
    res.status(403).json({ error: { code: 'forbidden_site', message: 'This site is not assigned to you' } });
    return;
  }
  const { date } = query(z.object({ date: isoDateSchema.optional() }), req);
  const d = date ?? isoDate();
  const summary = withoutCost(m.role, await siteDaySummary(m.companyId, id, d));
  // 14-day labour trend for the site detail chart.
  const from = new Date(`${d}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 13);
  const trend = await prisma.attendanceEntry.groupBy({
    by: ['date'],
    where: { projectId: id, deletedAt: null, date: { gte: from, lte: new Date(`${d}T00:00:00Z`) } },
    _sum: { count: true, halfDayCount: true },
    orderBy: { date: 'asc' },
  });
  res.json({ ...summary, trend: trend.map((t) => ({ date: t.date.toISOString().slice(0, 10), workers: (t._sum.count ?? 0) + (t._sum.halfDayCount ?? 0) })) });
});
