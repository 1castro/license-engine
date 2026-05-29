import { beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  activateLimiter,
  recheckLimiter,
  loginLimiter,
  portalForgotLimiter,
  portalPasswordLimiter,
} from '@/lib/auth/rate-limit';

/**
 * Per-file setup: wipe all tables before each test so cases are independent.
 * TRUNCATE ... CASCADE handles FK ordering in one statement. DATABASE_URL is
 * set by the `test:integration` script and verified in global-setup.
 */
const TABLES = [
  'Activation',
  'License',
  'ApiKey',
  'SigningKey',
  'Product',
  'CustomerAuthToken',
  'Customer',
  'AuditLog',
  'AdminUser',
];

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`,
  );
  // Rate limiters are module-level singletons whose token buckets otherwise
  // bleed across tests — reset them so per-test IP usage starts fresh.
  for (const l of [activateLimiter, recheckLimiter, loginLimiter, portalForgotLimiter, portalPasswordLimiter]) {
    l.reset();
  }
});
