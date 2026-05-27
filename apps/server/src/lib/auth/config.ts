import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import type { AdminRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { getLogger } from '../logger';
import { getEnv } from '../env';
import { verifyPassword } from './password';
import { verifyTotp } from './totp';
import { loginLimiter } from './rate-limit';
import { loginBackoff } from './login-backoff';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().regex(/^\d{6}$/),
});

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
          return null;
        }
        const backoffRemainingMs = loginBackoff.check(limiterKey);
        if (backoffRemainingMs !== null) {
          log.warn(
            { event: 'admin.login.backoff_active', email, backoffRemainingMs },
            'Login blocked by progressive backoff',
          );
          return null;
        }

        const user = await prisma.adminUser.findUnique({ where: { email } });
        // Uniform error: do not leak whether the email exists.
        if (!user) {
          // Still hash a dummy to keep timing roughly constant.
          await verifyPassword(password, '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAA$AAAAAAAAAAAA');
          loginBackoff.recordFailure(limiterKey);
          log.warn({ event: 'admin.login.unknown_email' }, 'Login with unknown email');
          return null;
        }

        const passwordOk = await verifyPassword(password, user.passwordHash);
        if (!passwordOk) {
          loginBackoff.recordFailure(limiterKey);
          log.warn({ event: 'admin.login.bad_password', userId: user.id }, 'Bad password');
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
          return null;
        }

        await prisma.adminUser.update({
          where: { id: user.id },
          data: {
            totpLastUsedStep: totpResult.usedStep,
            lastLoginAt: new Date(),
          },
        });
        loginBackoff.recordSuccess(limiterKey);

        log.info({ event: 'admin.login.success', userId: user.id }, 'Admin login');
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
      if (user) {
        token.role = (user as { role?: AdminRole }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: AdminRole }).role = token.role;
      }
      return session;
    },
  },
};
