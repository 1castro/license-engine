import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';

import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

import { LicenseForm } from '../_components/license-form';

export const dynamic = 'force-dynamic';

export default async function NewLicensePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [customers, productsRaw, t, tCommon] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, name: true },
    }),
    prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, featureCatalog: true },
    }),
    getTranslations('licenses'),
    getTranslations('common'),
  ]);

  const products = productsRaw.map((p) => ({
    id: p.id,
    name: p.name,
    featureCatalog: Array.isArray(p.featureCatalog)
      ? (p.featureCatalog.filter((f) => typeof f === 'string') as string[])
      : [],
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/licenses">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tCommon('back')}
          </Link>
        </Button>
      </div>
      <h1 className="text-2xl font-semibold">{t('createTitle')}</h1>
      <LicenseForm mode="create" customers={customers} products={products} />
    </div>
  );
}
