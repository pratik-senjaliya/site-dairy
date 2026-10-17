import { isoDate, planStatus } from '@site-diary/shared';
import type { Tx } from './db';
import { HttpError } from './errors';

export async function companyPlan(tx: Tx, companyId: string) {
  const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
  const activeSites = await tx.project.count({ where: { companyId, deletedAt: null, status: 'active' } });
  const activeUsers = await tx.user.count({ where: { companyId, deletedAt: null, isActive: true, role: { notIn: ['owner', 'accountant'] } } });
  return { ...planStatus(company.plan, isoDate(company.createdAt), isoDate(), activeSites), activeSites, activeUsers };
}

const UPGRADE = 'Contact Site Diary to upgrade your plan.';

/** Called before a site becomes active. */
export async function assertSiteAllowed(tx: Tx, companyId: string) {
  const p = await companyPlan(tx, companyId);
  if (p.maxActiveSites !== null && p.activeSites >= p.maxActiveSites) {
    throw new HttpError(402, `Your ${p.label} plan allows ${p.maxActiveSites} active sites. ${UPGRADE}`, 'plan_limit');
  }
}

/** Called before a field/office person (not owner or accountant) can sign in. */
export async function assertUserAllowed(tx: Tx, companyId: string) {
  const p = await companyPlan(tx, companyId);
  if (p.maxUsers !== null && p.activeUsers >= p.maxUsers) {
    throw new HttpError(402, `Your ${p.label} plan allows ${p.maxUsers} people for ${p.activeSites} active site(s). ${UPGRADE}`, 'plan_limit');
  }
}
