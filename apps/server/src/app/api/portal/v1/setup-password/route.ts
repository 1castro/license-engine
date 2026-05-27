import { NextResponse } from 'next/server';
import { extractIp } from '@/lib/audit';
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
