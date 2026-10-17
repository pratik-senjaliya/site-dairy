import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'error',
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (_req, _res, next) => next(new HttpError(404, 'Not found', 'not_found'));

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: 'invalid', message: 'Please check the highlighted fields', issues: err.issues } });
    return;
  }
  // A record that does not exist, or that row-level security hides from this company.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  console.error(err);
  Sentry.captureException(err); // no-op unless SENTRY_DSN is set
  res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong' } });
};
