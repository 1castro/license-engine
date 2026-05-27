import type { ReactNode } from 'react';
import '../globals.css';

/**
 * Portal layout — fully separate from the admin layout. Customers see a
 * trimmed-down chrome (no admin sidebar, no NextAuth session). Auth state
 * lives in the le_portal_session cookie.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <a href="/portal" className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Lizenz-Portal
            </a>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
