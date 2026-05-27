import { createHash, randomBytes } from 'node:crypto';
import type { Customer, CustomerAuthTokenPurpose } from '@prisma/client';
import { prisma } from '../prisma';

/**
 * Single-use auth tokens for the customer portal (initial-password setup +
 * password reset). The raw token is only ever embedded in the emailed link;
 * the database stores SHA-256 hashes so a DB leak doesn't grant portal access.
 */

const TOKEN_BYTES = 32; // 256 bit, base64url-encoded ≈ 43 chars
const DEFAULT_TTL_HOURS_SETUP = 72;
const DEFAULT_TTL_HOURS_RESET = 2;

export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

export interface IssuedToken {
  plaintext: string;
  expiresAt: Date;
}

export async function issueAuthToken(input: {
  customer: Pick<Customer, 'id'>;
  purpose: CustomerAuthTokenPurpose;
  ttlHours?: number;
}): Promise<IssuedToken> {
  const ttlHours =
    input.ttlHours ??
    (input.purpose === 'set_initial_password' ? DEFAULT_TTL_HOURS_SETUP : DEFAULT_TTL_HOURS_RESET);
  const plaintext = randomBytes(TOKEN_BYTES).toString('base64url');
  const tokenHash = hashToken(plaintext);
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000);

  // Invalidate any existing tokens of the same purpose to avoid stacking.
  await prisma.customerAuthToken.updateMany({
    where: { customerId: input.customer.id, purpose: input.purpose, usedAt: null },
    data: { usedAt: new Date() },
  });

  await prisma.customerAuthToken.create({
    data: {
      customerId: input.customer.id,
      tokenHash,
      purpose: input.purpose,
      expiresAt,
    },
  });
  return { plaintext, expiresAt };
}

export interface ConsumedToken {
  customerId: string;
}

export class AuthTokenInvalidError extends Error {
  constructor(public readonly reason: 'not_found' | 'expired' | 'used' | 'wrong_purpose') {
    super(`Auth token invalid (${reason})`);
    this.name = 'AuthTokenInvalidError';
  }
}

/**
 * Validates and consumes (marks usedAt) a portal auth token. Throws
 * AuthTokenInvalidError on any failure.
 */
export async function consumeAuthToken(input: {
  plaintext: string;
  expectedPurpose: CustomerAuthTokenPurpose;
}): Promise<ConsumedToken> {
  const tokenHash = hashToken(input.plaintext);
  const row = await prisma.customerAuthToken.findUnique({ where: { tokenHash } });
  if (!row) throw new AuthTokenInvalidError('not_found');
  if (row.purpose !== input.expectedPurpose) throw new AuthTokenInvalidError('wrong_purpose');
  if (row.usedAt !== null) throw new AuthTokenInvalidError('used');
  if (row.expiresAt.getTime() <= Date.now()) throw new AuthTokenInvalidError('expired');

  await prisma.customerAuthToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });
  return { customerId: row.customerId };
}
