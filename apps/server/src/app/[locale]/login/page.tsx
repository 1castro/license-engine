import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { LoginForm } from './login-form';

// Force runtime rendering — the form reads `?next=…` from the URL, which is
// not safe to statically prerender.
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
