import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import hpp from 'hpp';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { Env } from './config/env.js';
import { createErrorHandler, notFound } from './middleware/errorHandler.js';
import { requestTimeout } from './middleware/timeout.js';
import { LOGIN_LOCKOUT } from './config/rateLimits.js';
import { createMemoryLockoutStore, type LockoutStore } from './lib/lockout.js';
import { createGoogleAuth, type GoogleAuth } from './lib/google.js';
import type { Mailer } from './lib/mailer.js';
import type { MediaService } from './lib/media.js';
import { createLimiters } from './middleware/rateLimit.js';
import { adminRouter } from './routes/admin/index.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { contactRouter } from './routes/contact.js';
import { healthRouter, type ReadinessCheck } from './routes/health.js';
import { operatorSelfRouter } from './routes/operatorSelf.js';
import { settingsRouter } from './routes/settings.js';
import { shortsRouter } from './routes/shorts.js';
import { uploadsRouter } from './routes/uploads.js';

export { API_PREFIX } from './config/constants.js';
import { API_PREFIX } from './config/constants.js';

export interface AppDeps {
  env: Env;
  logger: Logger;
  checkReadiness: ReadinessCheck;
  mailer: Mailer;
  /** Cloudinary (or a fake in tests). */
  media: MediaService;
  /** Defaults to an in-memory store (Phase 8: Redis). */
  lockout?: LockoutStore;
  google?: GoogleAuth;
}

export function createApp({
  env,
  logger,
  checkReadiness,
  mailer,
  media,
  lockout,
  google,
}: AppDeps): Express {
  const app = express();
  const isProduction = env.NODE_ENV === 'production';

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY ?? 0);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && /^[\w-]{1,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url?.endsWith('/health') ?? false },
    }),
  );

  app.use(
    helmet({
      // The API only serves JSON; lock everything down.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => {
        // Non-browser clients (curl, health checkers) send no Origin.
        if (!origin || env.WEB_URL.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
      exposedHeaders: [
        'X-Request-Id',
        'Retry-After',
        'RateLimit-Limit',
        'RateLimit-Remaining',
        'RateLimit-Reset',
      ],
    }),
  );
  app.use(compression());
  app.use(requestTimeout(15_000));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());
  app.use(mongoSanitize());
  app.use(hpp());

  app.use(API_PREFIX, healthRouter(checkReadiness));

  const limiters = createLimiters();
  app.use(API_PREFIX, limiters.global);

  const lockoutStore = lockout ?? createMemoryLockoutStore(LOGIN_LOCKOUT);
  app.use(
    `${API_PREFIX}/auth`,
    authRouter({
      env,
      logger,
      mailer,
      media,
      lockout: lockoutStore,
      limiters,
      google: google ?? createGoogleAuth(env),
    }),
  );
  app.use(`${API_PREFIX}/contact`, contactRouter({ env, limiters }));
  app.use(`${API_PREFIX}/settings`, settingsRouter({ env }));
  app.use(API_PREFIX, catalogRouter({ env, limiters })); // /cities, /drones, /operators
  app.use(`${API_PREFIX}/shorts`, shortsRouter({ env, limiters }));
  app.use(`${API_PREFIX}/uploads`, uploadsRouter({ env, media, limiters }));
  app.use(`${API_PREFIX}/operator`, operatorSelfRouter({ env, media, logger }));
  app.use(`${API_PREFIX}/admin`, adminRouter({ env, mailer, limiters, media, logger }));

  app.use(notFound);
  app.use(createErrorHandler(isProduction));

  return app;
}
