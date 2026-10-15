import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { config } from './lib/config';
import { errorHandler, notFound } from './lib/errors';
import { jsonReplacer } from './lib/json';
import { v1 } from './routes';

export function createApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.set('json replacer', jsonReplacer);
  app.use(cors({ origin: config.webOrigins, credentials: true }));
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());
  app.use('/api/v1', v1);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
