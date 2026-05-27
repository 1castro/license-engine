import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Plus } from 'lucide-react';
import type { LicenseStatus, LicenseType } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Link } from '@/i18n/navigation';

import { LicenseRowActions } from './_components/license-row-actions';

export const dynamic = 'force-dynamic';

export default async function AdminLicensesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [licenses, t, tCommon] = await Promise.all([
    prisma.license.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, email: true, name: true } },
        product: { select: { id: true, name: true, slug: true } },
      },
    }),
    getTranslations('licenses'),
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
          <Link href="/admin/licenses/new">
            <Plus className="mr-2 h-4 w-4" />
            {t('createNew')}
          </Link>
        </Button>
      </div>

      {licenses.length === 0 ? (
        <div className="rounded-md border bg-background p-8 text-center text-sm text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('licenseKey')}</TableHead>
                <TableHead>{t('customer')}</TableHead>
                <TableHead>{t('product')}</TableHead>
                <TableHead>{t('type')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                <TableHead>{t('expiresAt')}</TableHead>
                <TableHead>{tCommon('createdAt')}</TableHead>
                <TableHead className="w-[60px] text-right">
                  <span className="sr-only">{tCommon('actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {licenses.map((license) => (
                <TableRow key={license.id}>
                  <TableCell className="font-mono text-xs">
                    {license.licenseKey}
                  </TableCell>
                  <TableCell>
                    <span className="block font-medium">
                      {license.customer.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {license.customer.email}
                    </span>
                  </TableCell>
                  <TableCell>{license.product.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {typeLabel(t, license.type)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(license.status)}>
                      {statusLabel(t, license.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {license.expiresAt
                      ? dateFormatter.format(license.expiresAt)
                      : t('noExpiry')}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {dateFormatter.format(license.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <LicenseRowActions
                      licenseId={license.id}
                      licenseKey={license.licenseKey}
                      isRevoked={license.status === 'revoked'}
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

type LicensesT = Awaited<ReturnType<typeof getTranslations<'licenses'>>>;

function typeLabel(t: LicensesT, type: LicenseType): string {
  return type === 'subscription' ? t('typeSubscription') : t('typePerpetual');
}

function statusLabel(t: LicensesT, status: LicenseStatus): string {
  switch (status) {
    case 'active':
      return t('statusActive');
    case 'revoked':
      return t('statusRevoked');
    case 'expired':
      return t('statusExpired');
  }
}

function statusVariant(
  status: LicenseStatus,
): 'default' | 'destructive' | 'secondary' {
  switch (status) {
    case 'active':
      return 'default';
    case 'revoked':
      return 'destructive';
    case 'expired':
      return 'secondary';
  }
}
