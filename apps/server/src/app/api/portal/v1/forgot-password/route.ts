import { NextResponse } from 'next/server';
import { portalForgotLimiter } from '@/lib/auth/rate-limit';
import { extractIp, hashIp } from '@/lib/audit';
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
  const ip = extractIp(req);
  const ipKey = hashIp(ip) ?? 'no-ip';
  // Rate-limit on (email, IP) so a victim's email can still receive a reset
  // even if an attacker is flooding from another IP.
  if (!portalForgotLimiter.tryConsume(`${email}|${ipKey}`)) {
    return jsonError(429, 'rate_limited', 'Zu viele Anfragen. Bitte warte einen Moment.');
  }
  await sendResetMail(email);
  return NextResponse.json({ ok: true });
}
