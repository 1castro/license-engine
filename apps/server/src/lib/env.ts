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
    // SMTP — all optional; if all five are set, SmtpMailSender is used
    // automatically, otherwise ConsoleMailSender prints to the pino log.
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM: z.string().min(1).optional(),
    /** Force a specific mail transport. Default = auto (smtp if configured, else console). */
    MAIL_TRANSPORT: z.enum(['console', 'smtp']).optional(),
  })
  .refine((data) => data.ENCRYPTION_KEY || data.ENCRYPTION_KEY_FILE, {
    message: 'Either ENCRYPTION_KEY or ENCRYPTION_KEY_FILE must be set.',
    path: ['ENCRYPTION_KEY'],
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
