import { beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

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
});
