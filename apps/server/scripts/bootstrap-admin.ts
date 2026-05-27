/**
 * Bootstrap the initial admin user.
 *
 * - Reads ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD from env.
 * - Refuses to run if any AdminUser already exists (open registration is not supported).
 * - Generates a TOTP secret and prints both the secret and an otpauth:// URL.
 *   Operator must scan it into an authenticator app immediately — the secret
 *   is not stored anywhere except the database.
 *
 * Usage:  pnpm admin:bootstrap
 */
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hashPassword } from '../src/lib/auth/password';
import { buildTotpOtpauthUrl, generateTotpSecret } from '../src/lib/auth/totp';

const envSchema = z.object({
  ADMIN_BOOTSTRAP_EMAIL: z.string().email(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12),
  JWT_ISSUER: z.string().min(1),
});

async function main(): Promise<void> {
  const env = envSchema.parse(process.env);
  const prisma = new PrismaClient();

  try {
    const existing = await prisma.adminUser.count();
    if (existing > 0) {
      console.error(
        `Refusing to bootstrap: ${existing} admin user(s) already exist. Use the admin UI to add more.`,
      );
      process.exitCode = 1;
      return;
    }

    const passwordHash = await hashPassword(env.ADMIN_BOOTSTRAP_PASSWORD);
    const totpSecret = generateTotpSecret();

    const user = await prisma.adminUser.create({
      data: {
        email: env.ADMIN_BOOTSTRAP_EMAIL,
        passwordHash,
        totpSecret,
        role: 'owner',
      },
    });

    const otpauth = buildTotpOtpauthUrl({
      secret: totpSecret,
      account: user.email,
      issuer: env.JWT_ISSUER,
    });

    console.log('\nAdmin user created.\n');
    console.log(`  Email:       ${user.email}`);
    console.log(`  Role:        ${user.role}`);
    console.log(`  TOTP secret: ${totpSecret}`);
    console.log(`  otpauth URL: ${otpauth}\n`);
    console.log(
      'Scan the URL with your authenticator now. The secret will not be shown again.\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
