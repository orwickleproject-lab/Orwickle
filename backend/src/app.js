import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { errorHandler, HttpError } from './middleware/errors.js';
import { healthRouter } from './routes/health.js';
import { createAuthRouter } from './auth/router.js';

export function createApp({ database, config, mailer }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use((request, response, next) => {
    request.id = randomUUID();
    response.set('X-Request-Id', request.id);
    response.set('Cache-Control', 'no-store');
    next();
  });
  app.use(rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, _response, next) => next(
      new HttpError(429, 'RATE_LIMITED', 'Too many requests; try again shortly'),
    ),
  }));
  app.use(express.json({ limit: '16kb' }));
  app.use('/health', healthRouter(database));
  if (config?.SESSION_SECRET && config?.OTP_PEPPER && database.configured) {
    app.use('/api', createAuthRouter({ database, config, mailer }));
  }
  app.use((_request, _response, next) => {
    next(new HttpError(404, 'NOT_FOUND', 'Endpoint not found'));
  });
  app.use(errorHandler);
  return app;
}
