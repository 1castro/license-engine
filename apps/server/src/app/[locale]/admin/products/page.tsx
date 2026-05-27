import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Plus } from 'lucide-react';

import { listProducts } from '@/lib/services/product-service';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Link } from '@/i18n/navigation';

import { ProductRowActions } from './_components/product-row-actions';

export const dynamic = 'force-dynamic';

export default async function AdminProductsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [products, t, tCommon] = await Promise.all([
    listProducts(),
    getTranslations('products'),
    getTranslations('common'),
  ]);

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button asChild>
          <Link href="/admin/products/new">
            <Plus className="mr-2 h-4 w-4" />
            {t('createNew')}
          </Link>
        </Button>
      </div>

      {products.length === 0 ? (
        <div className="rounded-md border bg-background p-8 text-center text-sm text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('slug')}</TableHead>
                <TableHead>{t('name')}</TableHead>
                <TableHead className="text-right">
                  {t('recheckInterval')}
                </TableHead>
                <TableHead className="text-right">
                  {t('jwtLifetime')}
                </TableHead>
                <TableHead>{t('prefix')}</TableHead>
                <TableHead>{tCommon('createdAt')}</TableHead>
                <TableHead className="w-[60px] text-right">
                  <span className="sr-only">{tCommon('actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono text-xs">
                    {product.slug}
                  </TableCell>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="text-right">
                    {product.recheckIntervalHours}
                  </TableCell>
                  <TableCell className="text-right">
                    {product.jwtLifetimeHours}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {product.licenseKeyPrefix}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {dateFormatter.format(product.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <ProductRowActions
                      productId={product.id}
                      productName={product.name}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
