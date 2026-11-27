import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import { WHATSAPP_ROUTINGS, toWaNumber } from '@video-lamhe/shared';

/** Treat empty strings in .env as "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    MONGO_POOL_SIZE: z.coerce.number().int().positive().default(20),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

    /** Comma-separated list of allowed browser origins. */
    /**
     * Number of reverse proxies in front of the API (Render/Nginx/Cloudflare → usually 1).
     * Decides which X-Forwarded-For entry is the client IP for rate limits. 0 = no proxy
     * (dev default). Required in production: a wrong value either lets clients spoof IPs
     * or makes every user share the proxy's IP (and one rate-limit bucket).
     */
    TRUST_PROXY: optional(z.coerce.number().int().min(0).max(10)),

    WEB_URL: z
      .string()
      .min(1)
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.url()).min(1)),

    // Optional in dev (features degrade); Cloudinary + SMTP are required in production (see superRefine).
    CLOUDINARY_CLOUD_NAME: optional(z.string()),
    CLOUDINARY_API_KEY: optional(z.string()),
    CLOUDINARY_API_SECRET: optional(z.string()),
    SMTP_HOST: optional(z.string()),
    SMTP_PORT: optional(z.coerce.number().int().positive()),
    SMTP_USER: optional(z.string()),
    SMTP_PASS: optional(z.string()),
    ADMIN_EMAIL: optional(z.email()),
    REDIS_URL: optional(z.url()),
    SENTRY_DSN: optional(z.url()),
    GOOGLE_CLIENT_ID: optional(z.string()),
    GOOGLE_CLIENT_SECRET: optional(z.string()),
    GOOGLE_REDIRECT_URI: optional(z.url()),

    ADMIN_WHATSAPP: z
      .string()
      .default('923462590643')
      .transform((v, ctx) => {
        const n = toWaNumber(v);
        if (!n) {
          ctx.addIssue({ code: 'custom', message: 'ADMIN_WHATSAPP is not a valid phone number' });
          return z.NEVER;
        }
        return n;
      }),
    WHATSAPP_ROUTING: z.enum(WHATSAPP_ROUTINGS).default('admin'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    // Uploads (shorts, photos) need Cloudinary in production.
    for (const key of [
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ] as const) {
      if (!env[key])
        ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required in production` });
    }
    // Password reset emails must actually be delivered in production.
    for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'] as const) {
      if (!env[key])
        ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required in production` });
    }
    if (env.TRUST_PROXY === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['TRUST_PROXY'],
        message:
          'TRUST_PROXY is required in production (number of proxies in front of the API, usually 1)',
      });
    }
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'Must differ from JWT_ACCESS_SECRET',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${lines.join('\n')}`);
  }
  return result.data;
}

/** Loads the repo-root .env (and an optional apps/api/.env) then validates. */
export function loadEnv(): Env {
  loadDotenv({
    path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
    quiet: true,
  });
  return parseEnv(process.env);
}
