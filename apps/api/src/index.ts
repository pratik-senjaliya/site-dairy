import * as Sentry from '@sentry/node';
import { createApp } from './app';
import { startJobs } from './jobs';
import { config } from './lib/config';

if (config.sentryDsn) Sentry.init({ dsn: config.sentryDsn, environment: process.env.NODE_ENV ?? 'development', tracesSampleRate: 0 });

createApp().listen(config.port, () => {
  console.log(`API on http://localhost:${config.port}/api/v1/health`);
  startJobs().catch((e: unknown) => console.error('jobs did not start:', e));
});
