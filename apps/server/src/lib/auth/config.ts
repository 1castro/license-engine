import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import type { AdminRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { getLogger } from '../logger';
import { getEnv } from '../env';
import { writeAuditLog, AuditEventType } from '../audit';
import { verifyPassword } from './password';
import { verifyTotp } from './totp';
import { loginLimiter } from './rate-limit';
import { loginBackoff } from './login-backoff';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().regex(/^\d{6}$/),
});

/**
 * Helper: write an admin-login event to the DB AuditLog. Fire-and-forget;
 * failures only warn-log so that auth itself never blocks on audit-writes.
 */
function auditLogin(
  eventType: AuditEventType,
  details: { userId?: string | null; email?: string; extra?: Record<string, unknown> },
): void {
  writeAuditLog({
    eventType,
    actorType: details.userId ? 'admin' : 'anonymous',
    actorId: details.userId ?? null,
    targetType: 'AdminUser',
    targetId: details.userId ?? null,
    metadata: { email: details.email, ...details.extra },
    ip: null,
  }).catch((err: unknown) => {
    getLogger().warn(
      { event: 'admin.login.audit_write_failed', err: err instanceof Error ? err.message : 'unknown' },
      'Failed to write admin-login audit entry',
    );
  });
}

export const authOptions: NextAuthOptions = {
  secret: getEnv().NEXTAUTH_SECRET,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 12 }, // 12h admin session
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'Admin',
      credentials: {
        email: { label: 'E-Mail', type: 'email' },
        password: { label: 'Passwort', type: 'password' },
        totp: { label: 'TOTP', type: 'text' },
      },
      async authorize(raw) {
        const log = getLogger();
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) {
          log.warn({ event: 'admin.login.malformed' }, 'Login payload rejected by schema');
          return null;
        }
        const { email, password, totp } = parsed.data;
        const limiterKey = email.toLowerCase();

        // Burst-rate-limit is the first gate (5/min). Progressive backoff is the
        // second gate that escalates the wait after consecutive failed logins.
        if (!loginLimiter.tryConsume(limiterKey)) {
          log.warn({ event: 'admin.login.ratelimited', email }, 'Login rate-limited');
          auditLogin(AuditEventType.AdminLoginRateLimited, { email });
          return null;
        }
        const backoffRemainingMs = loginBackoff.check(limiterKey);
        if (backoffRemainingMs !== null) {
          log.warn(
            { event: 'admin.login.backoff_active', email, backoffRemainingMs },
            'Login blocked by progressive backoff',
          );
          auditLogin(AuditEventType.AdminLoginRateLimited, {
            email,
            extra: { reason: 'backoff', remainingMs: backoffRemainingMs },
          });
          return null;
        }

        const user = await prisma.adminUser.findUnique({ where: { email } });
        // Uniform error: do not leak whether the email exists.
        if (!user) {
          // Still hash a dummy to keep timing roughly constant.
          await verifyPassword(password, '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAA$AAAAAAAAAAAA');
          loginBackoff.recordFailure(limiterKey);
          log.warn({ event: 'admin.login.unknown_email' }, 'Login with unknown email');
          auditLogin(AuditEventType.AdminLoginFailure, { email, extra: { reason: 'unknown_email' } });
          return null;
        }

        const passwordOk = await verifyPassword(password, user.passwordHash);
        if (!passwordOk) {
          loginBackoff.recordFailure(limiterKey);
          log.warn({ event: 'admin.login.bad_password', userId: user.id }, 'Bad password');
          auditLogin(AuditEventType.AdminLoginFailure, {
            email,
            userId: user.id,
            extra: { reason: 'bad_password' },
          });
          return null;
        }

        const totpResult = verifyTotp({
          token: totp,
          secret: user.totpSecret,
          lastUsedStep: user.totpLastUsedStep,
        });
        if (!totpResult.valid || totpResult.usedStep === undefined) {
          loginBackoff.recordFailure(limiterKey);
          log.warn({ event: 'admin.login.bad_totp', userId: user.id }, 'Bad / replayed TOTP');
          auditLogin(AuditEventType.AdminLoginFailure, {
            email,
            userId: user.id,
            extra: { reason: 'bad_totp' },
          });
          return null;
        }

        // Atomic compare-and-set on totpLastUsedStep prevents two parallel
        // requests with the same valid code from both succeeding. count===1
        // means we won the race; count===0 means another request already
        // consumed this (or a later) step → treat as replay.
        const claimed = await prisma.adminUser.updateMany({
          where: { id: user.id, totpLastUsedStep: { lt: totpResult.usedStep } },
          data: { totpLastUsedStep: totpResult.usedStep, lastLoginAt: new Date() },
        });
        if (claimed.count !== 1) {
          loginBackoff.recordFailure(limiterKey);
          log.warn(
            { event: 'admin.login.totp_race', userId: user.id },
            'TOTP step already consumed by parallel request',
          );
          auditLogin(AuditEventType.AdminLoginFailure, {
            email,
            userId: user.id,
            extra: { reason: 'totp_race' },
          });
          return null;
        }
        loginBackoff.recordSuccess(limiterKey);

        log.info({ event: 'admin.login.success', userId: user.id }, 'Admin login');
        auditLogin(AuditEventType.AdminLoginSuccess, { email, userId: user.id });
        return {
          id: user.id,
          email: user.email,
          name: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // First call after authorize(): the user object is present. Persist id+role
      // into the JWT so they survive subsequent calls (where only `token` is given).
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role?: AdminRole }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const su = session.user as { id?: string; role?: AdminRole };
        su.id = (token.id as string | undefined) ?? token.sub;
        su.role = token.role;
      }
      return session;
    },
  },
};
