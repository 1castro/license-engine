import { NextResponse } from 'next/server';
import { clearPortalSessionCookie } from '@/lib/portal/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  await clearPortalSessionCookie();
  return NextResponse.json({ ok: true });
}
