import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../middleware/errors.js';

export function healthRouter(database) {
  const router = Router();
  // Current health endpoints accept no inputs. Future routes validate their own schemas.
  router.use((request, _response, next) => {
    if (!z.object({}).strict().safeParse(request.query).success) {
      return next(new HttpError(400, 'INVALID_INPUT', 'Unexpected query parameters'));
    }
    next();
  });
  router.get('/live', (_request, response) => {
    response.json({ status: 'ok', service: 'orwickle-backend' });
  });
  router.get('/ready', async (_request, response) => {
    if (!database.configured) {
      throw new HttpError(503, 'DATABASE_NOT_CONFIGURED', 'Database is not configured');
    }
    try {
      const result = await database.check();
      response.json({ status: 'ok', database: 'ok', tls: result.tls, checkedAt: result.checkedAt });
    } catch {
      throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database is unavailable');
    }
  });
  return router;
}
