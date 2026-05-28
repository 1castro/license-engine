import type { ReactNode } from 'react';
import { prisma } from '@/lib/prisma';
import { getPortalSession } from '@/lib/portal/session';
import '../globals.css';

export const dynamic = 'force-dynamic';

/**
 * Portal layout — fully separate from the admin layout. Customers see a
 * trimmed-down chrome (no admin sidebar, no NextAuth session). Auth state
 * lives in the le_portal_session cookie.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const session = await getPortalSession();
  let companyLabel: string | null = null;
  if (session) {
    // Best-effort: a transient DB hiccup must not take down the whole portal
    // chrome (this layout also wraps the login page). Fall back to no label.
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: session.customerId },
        select: { company: true, name: true },
      });
      companyLabel = customer?.company ?? customer?.name ?? null;
    } catch {
      companyLabel = null;
    }
  }

  return (
    <html lang="de">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <a href="/portal" className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Lizenz-Portal
            </a>
            {companyLabel && (
              <span className="text-sm font-medium text-neutral-700">{companyLabel}</span>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
