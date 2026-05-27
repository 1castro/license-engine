import { NextResponse } from 'next/server';
import { authorizeAdminRoute, jsonError } from '@/lib/auth/admin-route-auth';
import {
  auditLogQuerySchema,
  listAuditLogs,
} from '@/lib/services/audit-log-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'audit:read' });
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const raw: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) raw[k] = v;

  const parsed = auditLogQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(400, 'validation_error', 'Invalid audit-log query', parsed.error.format());
  }

  const page = await listAuditLogs(parsed.data);
  return NextResponse.json(page);
}
