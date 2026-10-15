import { createApp } from './app';
import { startJobs } from './jobs';
import { config } from './lib/config';

createApp().listen(config.port, () => {
  console.log(`API on http://localhost:${config.port}/api/v1/health`);
  startJobs().catch((e: unknown) => console.error('jobs did not start:', e));
});
