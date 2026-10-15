import { z } from 'zod';
import { LANGUAGES } from './schemas';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

export const companySettingsSchema = z.object({
  /** Nightly report time (Asia/Kolkata). */
  reportTime: time.default('20:00'),
  /** "No entry yet" reminder to supervisors. */
  noEntryCutoff: time.default('19:00'),
  /** Purchase orders above this need the owner's approval. */
  poApprovalAbovePaise: z.number().int().nonnegative().default(50_000_00),
  /** Day the weekly wage settlement reminder goes out (0 = Sunday … 6 = Saturday). */
  wageDay: z.number().int().min(0).max(6).default(6),
  /** Labour change vs the 7-day average that is flagged in the nightly report. */
  labourAlertPercent: z.number().int().min(5).max(100).default(20),
  language: z.enum(LANGUAGES).default('gu'),
});
export type CompanySettings = z.infer<typeof companySettingsSchema>;

export const parseSettings = (raw: unknown): CompanySettings => companySettingsSchema.parse(raw ?? {});
