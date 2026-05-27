import { getServerSession } from 'next-auth';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { authOptions } from '@/lib/auth/config';

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getServerSession(authOptions);
  const t = await getTranslations('dashboard');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-neutral-700">
        {t('welcome', { name: session?.user?.email ?? '' })}
      </p>
      <p className="text-sm text-neutral-500">{t('placeholder')}</p>
    </div>
  );
}
