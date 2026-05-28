import { NextResponse } from 'next/server';
import { extractIp, hashIp } from '@/lib/audit';
import { portalPasswordLimiter } from '@/lib/auth/rate-limit';
import {
  PortalAuthError,
  setInitialPassword,
  setInitialPasswordSchema,
} from '@/lib/portal/auth-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: Request) {
  const ipHashForLimit = hashIp(extractIp(req)) ?? 'no-ip';
  if (!portalPasswordLimiter.tryConsume(ipHashForLimit)) {
    return jsonError(429, 'rate_limited', 'Zu viele Versuche, bitte kurz warten');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'invalid_json', 'Request body must be valid JSON');
  }
  const parsed = setInitialPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'validation_error', 'Invalid payload');
  }
  try {
    await setInitialPassword({
      token: parsed.data.token,
      password: parsed.data.password,
      ipForAudit: extractIp(req),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PortalAuthError) return jsonError(400, err.code, err.message);
    throw err;
  }
}
