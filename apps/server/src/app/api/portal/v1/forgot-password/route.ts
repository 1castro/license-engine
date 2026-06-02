import { NextResponse } from 'next/server';
import { portalForgotLimiter, portalForgotIpLimiter } from '@/lib/auth/rate-limit';
import { extractIp, hashIp } from '@/lib/audit';
import { getLogger } from '@/lib/logger';
import { forgotPasswordSchema, sendResetMail } from '@/lib/portal/auth-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * POST /api/portal/v1/forgot-password
 *
 * Always returns 200 so the caller can't tell whether the email exists in
 * our DB (enumeration defense). Rate-limited per email to prevent
 * mail-bombing a victim's inbox.
 */
export async function POST(req: Request) {
  try {
    return await handleForgotPassword(req);
  } catch (err) {
    // A sendResetMail / DB failure is email-independent, so a uniform 500 does
    // not weaken the enumeration defense — but it must be JSON, not raw HTML.
    getLogger().error({ event: 'portal.forgot_password.internal_error', err }, 'Forgot-password failed');
    return jsonError(500, 'internal_error', 'Internal server error');
  }
}

async function handleForgotPassword(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'invalid_json', 'Request body must be valid JSON');
  }
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'validation_error', 'Invalid forgot-password payload');
  }
  const email = parsed.data.email.toLowerCase();
  const ipHash = hashIp(extractIp(req));
  // Two independent gates:
  //  - per-email (IP-independent): the mail-bomb cap — limits how many reset
  //    mails one address can receive, even if the attacker rotates IPs. This is
  //    the primary protection and always applies.
  //  - per-IP: caps one source spraying resets across many different addresses.
  //    Skipped when there is no trustworthy client IP (TRUST_PROXY_HEADERS off →
  //    hashIp null), otherwise it would collapse into one global bucket.
  // `||` short-circuits, so a request blocked by the email gate doesn't consume
  // a per-IP token.
  if (
    !portalForgotLimiter.tryConsume(email) ||
    (ipHash !== null && !portalForgotIpLimiter.tryConsume(ipHash))
  ) {
    return jsonError(429, 'rate_limited', 'Zu viele Anfragen. Bitte warte einen Moment.');
  }
  await sendResetMail(email);
  return NextResponse.json({ ok: true });
}
