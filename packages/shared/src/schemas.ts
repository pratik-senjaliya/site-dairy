import { z } from 'zod';

export const ROLES = ['owner', 'engineer', 'supervisor', 'store', 'accountant'] as const;
export type Role = (typeof ROLES)[number];

export const UNITS = ['bag', 'ton', 'brass', 'nos', 'cft', 'sqft', 'kg', 'litre', 'rft', 'cum'] as const;
export type Unit = (typeof UNITS)[number];

export const LANGUAGES = ['gu', 'en', 'hi'] as const;
export type Language = (typeof LANGUAGES)[number];

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const uuidSchema = z.string().uuid();
/** Indian mobile number, stored as +91XXXXXXXXXX. */
export const phoneSchema = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^(\+91)?[6-9]\d{9}$/, 'Enter a 10-digit mobile number'))
  .transform((s) => (s.startsWith('+91') ? s : `+91${s}`));
export const paiseSchema = z.number().int().nonnegative();
export const qtySchema = z.number().nonnegative().max(999_999_999.999);

export const attendanceEntrySchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  date: isoDateSchema,
  contractorId: uuidSchema,
  skillId: uuidSchema,
  count: z.number().int().min(0).max(999),
  halfDayCount: z.number().int().min(0).max(999),
  otHours: z.number().min(0).max(9999),
  photoId: uuidSchema.nullable().optional(),
});
export type AttendanceEntryInput = z.infer<typeof attendanceEntrySchema>;
