import * as Sentry from '@sentry/node';
import { Router } from 'express';
import { z } from 'zod';
import { body } from '../lib/validate';

// The web panel and the phone app report crashes here; the API forwards them to Sentry (when SENTRY_DSN is set)
// and its own log, so one error service covers all three. No sign-in needed (a crash can happen before it).
export const clientErrors = Router();

const recent = new Map<string, number[]>();
const LIMIT_PER_MINUTE = 20;

clientErrors.post('/', (req, res) => {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= LIMIT_PER_MINUTE) {
    res.status(429).json({ ok: false });
    return;
  }
  recent.set(ip, [...hits, now]);
  const e = body(
    z.object({
      app: z.enum(['web', 'mobile']),
      message: z.string().max(2000),
      stack: z.string().max(10_000).optional(),
      url: z.string().max(1000).optional(),
      version: z.string().max(50).optional(),
      platform: z.string().max(50).optional(),
    }),
    req,
  );
  console.error(`[client:${e.app}] ${e.message}${e.url ? ` at ${e.url}` : ''}`);
  Sentry.withScope((scope) => {
    scope.setTag('app', e.app);
    if (e.platform) scope.setTag('platform', e.platform);
    if (e.version) scope.setTag('version', e.version);
    scope.setExtra('stack', e.stack);
    scope.setExtra('url', e.url);
    Sentry.captureMessage(`[${e.app}] ${e.message}`, 'error');
  });
  res.json({ ok: true });
});
