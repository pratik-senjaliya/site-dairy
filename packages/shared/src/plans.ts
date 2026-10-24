import { addDays } from './dates';

// Pricing (docs/scope.md → Pricing; decisions 2026-10-24): Pilot free 60 days up to 5 sites (builders run 1–5);
// Basic 5 users per site; Pro unlimited.
export const PLANS = {
  pilot: { label: 'Pilot', maxActiveSites: 5, usersPerSite: null, days: 60 },
  basic: { label: 'Basic', maxActiveSites: null, usersPerSite: 5, days: null },
  pro: { label: 'Pro', maxActiveSites: null, usersPerSite: null, days: null },
} as const;
export type Plan = keyof typeof PLANS;
export const isPlan = (p: string): p is Plan => p in PLANS;

export interface PlanStatus {
  plan: Plan;
  label: string;
  /** Pilot end date (YYYY-MM-DD) or null. */
  endsOn: string | null;
  daysLeft: number | null;
  maxActiveSites: number | null;
  maxUsers: number | null;
}

/** Owners and accountants are not counted against "users per site". */
export function planStatus(plan: string, startedOn: string, today: string, activeSites: number): PlanStatus {
  const p = isPlan(plan) ? plan : 'pilot';
  const def = PLANS[p];
  const endsOn = def.days ? addDays(startedOn, def.days) : null;
  const daysLeft = endsOn ? Math.round((Date.parse(endsOn) - Date.parse(today)) / 86_400_000) : null;
  return { plan: p, label: def.label, endsOn, daysLeft, maxActiveSites: def.maxActiveSites, maxUsers: def.usersPerSite ? def.usersPerSite * Math.max(1, activeSites) : null };
}
