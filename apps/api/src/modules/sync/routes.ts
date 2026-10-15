import { pushRequestSchema } from '@site-diary/shared';
import { Router } from 'express';
import { z } from 'zod';
import { me } from '../../lib/auth';
import { body, query } from '../../lib/validate';
import { pull } from './pull';
import { push } from './push';

export const sync = Router();

sync.get('/pull', async (req, res) => {
  const { since } = query(z.object({ since: z.string().regex(/^\d+$/).default('0') }), req);
  res.json(await pull(me(req), BigInt(since)));
});

sync.post('/push', async (req, res) => {
  const { changes } = body(pushRequestSchema, req);
  res.json(await push(me(req), req.ip ?? null, changes));
});
