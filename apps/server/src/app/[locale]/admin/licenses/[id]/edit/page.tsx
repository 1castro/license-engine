import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';

import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Link, redirect } from '@/i18n/navigation';

import { LicenseForm } from '../../_components/license-form';

export const dynamic = 'force-dynamic';

export default async function EditLicensePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const license = await prisma.license.findUnique({ where: { id } });
  if (!license) {
    redirect({ href: '/admin/licenses', locale });
    return null;
  }

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

  const featureFlags = Array.isArray(license.featureFlags)
    ? (license.featureFlags.filter((f) => typeof f === 'string') as string[])
    : [];

  const bindingPolicy =
    license.bindingPolicy &&
    typeof license.bindingPolicy === 'object' &&
    !Array.isArray(license.bindingPolicy)
      ? (license.bindingPolicy as Record<string, unknown>)
      : {};

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
      <h1 className="text-2xl font-semibold">{t('editTitle')}</h1>
      <LicenseForm
        mode="edit"
        customers={customers}
        products={products}
        initial={{
          id: license.id,
          customerId: license.customerId,
          productId: license.productId,
          licenseKey: license.licenseKey,
          type: license.type,
          expiresAt: license.expiresAt ? license.expiresAt.toISOString() : null,
          featureFlags,
          bindingPolicy,
          externalRef: license.externalRef,
          externalSource: license.externalSource,
          planName: license.planName,
          priceDisplay: license.priceDisplay,
          billingInterval: license.billingInterval,
        }}
      />
    </div>
  );
}
