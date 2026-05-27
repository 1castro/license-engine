import type { Customer } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { getEnv } from '../env';
import { getLogger } from '../logger';
import { hashPassword, verifyPassword } from '../auth/password';
import { writeAuditLog, AuditEventType } from '../audit';
import { getMailSender } from '../mail/mail-sender';
import { buildResetPasswordMail, buildSetupPasswordMail } from '../mail/templates';
import {
  AuthTokenInvalidError,
  consumeAuthToken,
  issueAuthToken,
} from './auth-token';

/**
 * Service-layer for the customer self-service portal.
 *
 * Surface area:
 *   - sendSetupMail(customer)       triggered by createCustomer (or "resend" UI)
 *   - sendResetMail(email)          forgot-password flow
 *   - setInitialPassword(token, pw) consumes initial token, sets password,
 *                                   marks email verified
 *   - resetPassword(token, pw)      consumes reset token, swaps password
 *   - login(email, password, ip)    returns customer if credentials valid
 *
 * Auth events go to AuditLog; the actorType is "system" for token issuance
 * (we have no acting subject when the customer requests a reset) and
 * "anonymous" for login attempts (we don't yet know which customer until
 * after the lookup).
 */

export const passwordSchema = z
  .string()
  .min(12, 'Mindestens 12 Zeichen')
  .max(200);

export const setInitialPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(254),
});

export type LoginInput = z.infer<typeof loginSchema>;

export class PortalAuthError extends Error {
  constructor(
    public readonly code:
      | 'token_invalid'
      | 'token_expired'
      | 'token_used'
      | 'token_wrong_purpose'
      | 'invalid_credentials'
      | 'no_password_set',
    message: string,
  ) {
    super(message);
    this.name = 'PortalAuthError';
  }
}

function mapTokenError(err: AuthTokenInvalidError): PortalAuthError {
  switch (err.reason) {
    case 'not_found':
      return new PortalAuthError('token_invalid', 'Token unbekannt');
    case 'expired':
      return new PortalAuthError('token_expired', 'Token ist abgelaufen');
    case 'used':
      return new PortalAuthError('token_used', 'Token wurde schon verbraucht');
    case 'wrong_purpose':
      return new PortalAuthError('token_wrong_purpose', 'Token-Verwendung passt nicht');
  }
}

function portalUrl(path: string): string {
  const base = getEnv().APP_BASE_URL.replace(/\/$/, '');
  return `${base}${path}`;
}

/**
 * Issues an initial-setup token and emails the customer a link to set their
 * portal password. Called by createCustomer for new customers + by the
 * "resend setup mail" admin button.
 */
export async function sendSetupMail(customer: Pick<Customer, 'id' | 'email' | 'name'>): Promise<void> {
  const { plaintext, expiresAt } = await issueAuthToken({
    customer,
    purpose: 'set_initial_password',
  });
  const setupUrl = portalUrl(`/portal/setup?token=${encodeURIComponent(plaintext)}`);
  await getMailSender().send(
    buildSetupPasswordMail({
      to: customer.email,
      customerName: customer.name,
      setupUrl,
      expiresAt,
    }),
  );
  getLogger().info({ event: 'portal.setup_mail_sent', customerId: customer.id }, 'Setup mail issued');
}

/**
 * forgot-password flow: looks up by email; if a customer exists, issues a
 * reset token + emails it. Returns nothing — never leaks whether the email
 * exists in the system (enumeration defense).
 */
export async function sendResetMail(email: string): Promise<void> {
  const customer = await prisma.customer.findFirst({ where: { email } });
  if (!customer) {
    getLogger().info({ event: 'portal.reset_mail_unknown_email' }, 'Reset requested for unknown email');
    return;
  }
  const { plaintext, expiresAt } = await issueAuthToken({
    customer,
    purpose: 'reset_password',
  });
  const resetUrl = portalUrl(`/portal/reset?token=${encodeURIComponent(plaintext)}`);
  await getMailSender().send(
    buildResetPasswordMail({
      to: customer.email,
      customerName: customer.name,
      resetUrl,
      expiresAt,
    }),
  );
  getLogger().info({ event: 'portal.reset_mail_sent', customerId: customer.id }, 'Reset mail issued');
}

export async function setInitialPassword(input: {
  token: string;
  password: string;
  ipForAudit: string | null;
}): Promise<{ customer: Customer }> {
  let consumed;
  try {
    consumed = await consumeAuthToken({
      plaintext: input.token,
      expectedPurpose: 'set_initial_password',
    });
  } catch (err) {
    if (err instanceof AuthTokenInvalidError) throw mapTokenError(err);
    throw err;
  }
  const passwordHash = await hashPassword(input.password);
  const customer = await prisma.customer.update({
    where: { id: consumed.customerId },
    data: { passwordHash, emailVerifiedAt: new Date() },
  });
  await writeAuditLog({
    eventType: AuditEventType.AdminLoginSuccess, // reuse — Phase-7 may add a dedicated portal event
    actorType: 'system',
    actorId: null,
    targetType: 'Customer',
    targetId: customer.id,
    metadata: { op: 'portal.initial_password_set' },
    ip: input.ipForAudit,
  });
  return { customer };
}

export async function resetPassword(input: {
  token: string;
  password: string;
  ipForAudit: string | null;
}): Promise<{ customer: Customer }> {
  let consumed;
  try {
    consumed = await consumeAuthToken({
      plaintext: input.token,
      expectedPurpose: 'reset_password',
    });
  } catch (err) {
    if (err instanceof AuthTokenInvalidError) throw mapTokenError(err);
    throw err;
  }
  const passwordHash = await hashPassword(input.password);
  const customer = await prisma.customer.update({
    where: { id: consumed.customerId },
    data: { passwordHash },
  });
  await writeAuditLog({
    eventType: AuditEventType.AdminLoginSuccess,
    actorType: 'system',
    actorId: null,
    targetType: 'Customer',
    targetId: customer.id,
    metadata: { op: 'portal.password_reset' },
    ip: input.ipForAudit,
  });
  return { customer };
}

/**
 * Verifies email + password. Returns the customer on success, throws
 * PortalAuthError on failure. Caller is responsible for rate-limit + backoff.
 */
export async function loginCustomer(input: LoginInput): Promise<Customer> {
  const customer = await prisma.customer.findFirst({ where: { email: input.email } });
  if (!customer || !customer.passwordHash) {
    // Run a dummy verify so timing matches the wrong-password path.
    await verifyPassword(input.password, '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAA$AAAAAAAAAAAA');
    throw new PortalAuthError('invalid_credentials', 'E-Mail oder Passwort falsch');
  }
  const ok = await verifyPassword(input.password, customer.passwordHash);
  if (!ok) {
    throw new PortalAuthError('invalid_credentials', 'E-Mail oder Passwort falsch');
  }
  await prisma.customer.update({
    where: { id: customer.id },
    data: { portalLastLoginAt: new Date() },
  });
  return customer;
}
