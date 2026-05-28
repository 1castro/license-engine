import { createHmac } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { getEnv } from '../env';
import { prisma } from '../prisma';

/**
 * Customer-portal session — a JWT cookie separate from the admin NextAuth
 * cookie. Signed with HS256 using NEXTAUTH_SECRET (same secret pool, no new
 * env var). 30-day lifetime. Stateless (no DB-side revoke list Tag-2; that
 * lands when we need centrally-revocable sessions).
 */

export const PORTAL_COOKIE_NAME = 'le_portal_session';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const ALG = 'HS256' as const;
const PORTAL_SECRET_CONTEXT = 'license-engine:portal-session:v1';
const PORTAL_ISSUER = 'license-engine';
const PORTAL_AUDIENCE = 'license-portal';

export interface PortalSessionPayload {
  customerId: string;
  email: string;
  iat: number;
  exp: number;
}

let cachedSecret: Uint8Array | undefined;

function secretBytes(): Uint8Array {
  if (!cachedSecret) {
    // Derive a portal-specific signing key from NEXTAUTH_SECRET so the portal
    // session JWT and the admin NextAuth token never share a key (separate trust
    // domains), without adding a new env var. Same HKDF-extract-like pattern as
    // the audit IP salt.
    cachedSecret = new Uint8Array(
      createHmac('sha256', getEnv().NEXTAUTH_SECRET).update(PORTAL_SECRET_CONTEXT).digest(),
    );
  }
  return cachedSecret;
}

export async function signPortalSession(input: { customerId: string; email: string }): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_TTL_SECONDS;
  const token = await new SignJWT({ email: input.email })
    .setProtectedHeader({ alg: ALG, typ: 'JWT' })
    .setSubject(input.customerId)
    .setIssuer(PORTAL_ISSUER)
    .setAudience(PORTAL_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secretBytes());
  return { token, expiresAt: new Date(exp * 1000) };
}

export async function verifyPortalSession(token: string): Promise<PortalSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretBytes(), {
      algorithms: [ALG],
      issuer: PORTAL_ISSUER,
      audience: PORTAL_AUDIENCE,
    });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') return null;
    return {
      customerId: payload.sub,
      email: payload.email,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

/** Reads + verifies the portal session cookie. Returns null when missing/invalid. */
export async function getPortalSession(): Promise<PortalSessionPayload | null> {
  const jar = await cookies();
  const c = jar.get(PORTAL_COOKIE_NAME);
  if (!c?.value) return null;
  const payload = await verifyPortalSession(c.value);
  if (!payload) return null;

  // Stateless-JWT invalidation: reject sessions issued before the customer's
  // last credential change (password set/reset bumps portalSessionsValidAfter).
  const customer = await prisma.customer.findUnique({
    where: { id: payload.customerId },
    select: { portalSessionsValidAfter: true },
  });
  if (!customer) return null;
  if (
    customer.portalSessionsValidAfter &&
    payload.iat * 1000 < customer.portalSessionsValidAfter.getTime()
  ) {
    return null;
  }
  return payload;
}

export async function setPortalSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  jar.set({
    name: PORTAL_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Strict: the portal is a same-origin app and the cookie should never be
    // forwarded on cross-site navigations — kills classic CSRF without the
    // need for a separate anti-CSRF token. Strict is safe here because there
    // is no external SSO redirect flow that would lose the cookie.
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearPortalSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(PORTAL_COOKIE_NAME);
}
