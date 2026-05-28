import { NextResponse } from 'next/server';
import { loginLimiter } from '@/lib/auth/rate-limit';
import { loginBackoff } from '@/lib/auth/login-backoff';
import { getLogger } from '@/lib/logger';
import { extractIp, hashIp, writeAuditLog, AuditEventType } from '@/lib/audit';
import {
  loginCustomer,
  loginSchema,
  PortalAuthError,
} from '@/lib/portal/auth-service';
import { setPortalSessionCookie, signPortalSession } from '@/lib/portal/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: Request) {
  const log = getLogger();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'invalid_json', 'Request body must be valid JSON');
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'validation_error', 'Invalid login payload');
  }
  const ip = extractIp(req);
  // Never log the raw IP — DSGVO. Logs and audit trail only ever see the hash.
  const ipHash = hashIp(ip);
  const limiterKey = `portal:${parsed.data.email.toLowerCase()}`;

  if (!loginLimiter.tryConsume(limiterKey)) {
    return jsonError(429, 'rate_limited', 'Zu viele Versuche. Bitte warte einen Moment.');
  }
  const backoffRemainingMs = loginBackoff.check(limiterKey);
  if (backoffRemainingMs !== null) {
    return jsonError(429, 'rate_limited', 'Zu viele Versuche. Bitte warte einen Moment.');
  }

  try {
    const customer = await loginCustomer(parsed.data);
    loginBackoff.recordSuccess(limiterKey);

    const { token, expiresAt } = await signPortalSession({
      customerId: customer.id,
      email: customer.email,
    });
    await setPortalSessionCookie(token, expiresAt);
    log.info({ event: 'portal.login.success', customerId: customer.id, ipHash }, 'Portal login');
    await writeAuditLog({
      eventType: AuditEventType.PortalLoginSuccess,
      actorType: 'customer',
      actorId: customer.id,
      targetType: 'Customer',
      targetId: customer.id,
      ip,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PortalAuthError) {
      loginBackoff.recordFailure(limiterKey);
      log.warn(
        { event: 'portal.login.fail', code: err.code, ipHash },
        'Portal login failed',
      );
      // Anonymous actor + no email in metadata (DSGVO — only the hashed IP,
      // added inside writeAuditLog, is persisted).
      await writeAuditLog({
        eventType: AuditEventType.PortalLoginFailure,
        actorType: 'anonymous',
        actorId: null,
        metadata: { code: err.code },
        ip,
      });
      return jsonError(401, err.code, err.message);
    }
    throw err;
  }
}
