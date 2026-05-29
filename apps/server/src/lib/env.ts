import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url(),
    APP_BASE_URL: z.string().url(),
    JWT_ISSUER: z.string().min(1),
    NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),
    NEXTAUTH_URL: z.string().url(),
    ENCRYPTION_KEY: z.string().optional(),
    ENCRYPTION_KEY_FILE: z.string().optional(),
    LOG_LEVEL: z
      .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
      .default('info'),
    ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
    ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12).optional(),
    /**
     * Shared secret that gates /api/health. When set, the endpoint only answers
     * requests presenting it (header `x-health-token` or `?token=`); everything
     * else gets 404. The Docker healthcheck + monitoring send it. Leave unset in
     * dev to keep the endpoint open. Next.js rewrites all x-forwarded-* headers,
     * so a token is the only reliable internal/external discriminator.
     */
    HEALTH_CHECK_TOKEN: z.string().min(1).optional(),
    // SMTP — all optional; if all five are set, SmtpMailSender is used
    // automatically, otherwise ConsoleMailSender prints to the pino log.
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM: z.string().min(1).optional(),
    /** Force a specific mail transport. Default = auto (smtp if configured, else console). */
    MAIL_TRANSPORT: z.enum(['console', 'smtp']).optional(),
    /**
     * Audit-log retention windows (days) for the `audit:prune` cron. Routine
     * bookkeeping is removed sooner; security-/forensics-relevant events
     * (logins, rejected activations, revocations, key/credential lifecycle —
     * see CRITICAL_EVENTS) are kept longer.
     */
    AUDIT_RETENTION_ROUTINE_DAYS: z.coerce.number().int().min(1).max(36500).default(90),
    AUDIT_RETENTION_CRITICAL_DAYS: z.coerce.number().int().min(1).max(36500).default(365),
    /**
     * Opt-in: trust X-Forwarded-For / X-Real-IP headers for `extractIp`. Set
     * to `true` in production behind a reverse proxy (NPM), where the app
     * container has no direct public port-mapping and the proxy is the only
     * way in. Default `false` → ignore proxy headers so attacker-supplied
     * headers can't poison rate-limit buckets / audit-log IP hashes.
     */
    TRUST_PROXY_HEADERS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .refine((data) => data.ENCRYPTION_KEY || data.ENCRYPTION_KEY_FILE, {
    message: 'Either ENCRYPTION_KEY or ENCRYPTION_KEY_FILE must be set.',
    path: ['ENCRYPTION_KEY'],
  })
  .refine((data) => data.AUDIT_RETENTION_CRITICAL_DAYS >= data.AUDIT_RETENTION_ROUTINE_DAYS, {
    message:
      'AUDIT_RETENTION_CRITICAL_DAYS must be >= AUDIT_RETENTION_ROUTINE_DAYS — otherwise security events would be pruned sooner than routine ones.',
    path: ['AUDIT_RETENTION_CRITICAL_DAYS'],
  });

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      // Fail fast at startup — never run with a broken environment.
      const issues = parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}
