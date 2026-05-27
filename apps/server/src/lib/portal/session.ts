import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { getEnv } from '../env';

/**
 * Customer-portal session — a JWT cookie separate from the admin NextAuth
 * cookie. Signed with HS256 using NEXTAUTH_SECRET (same secret pool, no new
 * env var). 30-day lifetime. Stateless (no DB-side revoke list Tag-2; that
 * lands when we need centrally-revocable sessions).
 */

export const PORTAL_COOKIE_NAME = 'le_portal_session';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const ALG = 'HS256' as const;

export interface PortalSessionPayload {
  customerId: string;
  email: string;
  iat: number;
  exp: number;
}

function secretBytes(): Uint8Array {
  return new TextEncoder().encode(getEnv().NEXTAUTH_SECRET);
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
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secretBytes());
  return { token, expiresAt: new Date(exp * 1000) };
}

export async function verifyPortalSession(token: string): Promise<PortalSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretBytes(), { algorithms: [ALG] });
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
  return verifyPortalSession(c.value);
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
