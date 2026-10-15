import { createApp } from './app';
import { config } from './lib/config';

createApp().listen(config.port, () => {
  console.log(`API on http://localhost:${config.port}/api/v1/health`);
});
