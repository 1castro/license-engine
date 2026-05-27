import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Link, redirect } from '@/i18n/navigation';
import { getProduct } from '@/lib/services/product-service';

import { ProductForm } from '../../_components/product-form';

export const dynamic = 'force-dynamic';

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const product = await getProduct(id);
  if (!product) {
    redirect({ href: '/admin/products', locale });
    return null;
  }

  const [t, tCommon] = await Promise.all([
    getTranslations('products'),
    getTranslations('common'),
  ]);

  const featureCatalog = Array.isArray(product.featureCatalog)
    ? (product.featureCatalog.filter((f) => typeof f === 'string') as string[])
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/products">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tCommon('back')}
          </Link>
        </Button>
      </div>
      <h1 className="text-2xl font-semibold">{t('editTitle')}</h1>
      <ProductForm
        mode="edit"
        initial={{
          id: product.id,
          slug: product.slug,
          name: product.name,
          recheckIntervalHours: product.recheckIntervalHours,
          jwtLifetimeHours: product.jwtLifetimeHours,
          licenseKeyPrefix: product.licenseKeyPrefix,
          revocationStrategy: product.revocationStrategy,
          featureCatalog,
        }}
      />
    </div>
  );
}
