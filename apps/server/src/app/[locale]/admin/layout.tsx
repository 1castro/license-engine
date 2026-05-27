import type { ReactNode } from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Defense in depth — middleware already redirects, but a server check
  // means a missing middleware can't accidentally expose admin routes.
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect({ href: '/login', locale });
    // redirect() throws; satisfies the type-checker that `session` is non-null below.
    return null;
  }

  const t = await getTranslations('nav');

  return (
    <div className="min-h-screen bg-neutral-50">
      <aside className="fixed inset-y-0 left-0 flex w-56 flex-col border-r border-neutral-200 bg-white">
        <div className="px-6 py-5 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          License Engine
        </div>
        <nav className="flex-1 space-y-1 px-3">
          <NavItem href="/admin" label={t('dashboard')} />
          <NavItem href="/admin/products" label={t('products')} disabled />
          <NavItem href="/admin/customers" label={t('customers')} disabled />
          <NavItem href="/admin/licenses" label={t('licenses')} disabled />
          <NavItem href="/admin/api-keys" label={t('apiKeys')} disabled />
          <NavItem href="/admin/audit-log" label={t('auditLog')} disabled />
          <NavItem href="/admin/settings" label={t('settings')} disabled />
        </nav>
        <div className="border-t border-neutral-200 px-3 py-3 text-sm">
          <span className="block px-3 py-1 text-neutral-500">{session.user?.email}</span>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="w-full rounded px-3 py-2 text-left text-neutral-700 hover:bg-neutral-100"
            >
              {t('logout')}
            </button>
          </form>
        </div>
      </aside>
      <main className="ml-56 px-8 py-8">{children}</main>
    </div>
  );
}

function NavItem({ href, label, disabled }: { href: string; label: string; disabled?: boolean }) {
  if (disabled) {
    return (
      <span className="block cursor-not-allowed rounded px-3 py-2 text-sm text-neutral-400">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="block rounded px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
    >
      {label}
    </Link>
  );
}
