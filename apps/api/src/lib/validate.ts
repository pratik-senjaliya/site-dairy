import type { Request } from 'express';
import type { z } from 'zod';

export const body = <S extends z.ZodTypeAny>(schema: S, req: Request): z.infer<S> => schema.parse(req.body);
export const query = <S extends z.ZodTypeAny>(schema: S, req: Request): z.infer<S> => schema.parse(req.query);
export const param = (req: Request, name = 'id') => String(req.params[name]);
