import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Plus } from 'lucide-react';

import { listCustomers } from '@/lib/services/customer-service';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/i18n/navigation';

import { CustomerRowActions } from './_components/customer-row-actions';

export const dynamic = 'force-dynamic';

export default async function AdminCustomersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [customers, t, tCommon] = await Promise.all([
    listCustomers(),
    getTranslations('customers'),
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
          <Link href="/admin/customers/new">
            <Plus className="mr-2 h-4 w-4" />
            {t('createNew')}
          </Link>
        </Button>
      </div>

      {customers.length === 0 ? (
        <div className="rounded-md border bg-background p-8 text-center text-sm text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('email')}</TableHead>
                <TableHead>{t('name')}</TableHead>
                <TableHead>{t('company')}</TableHead>
                <TableHead>{t('externalSource')}</TableHead>
                <TableHead>{t('externalRef')}</TableHead>
                <TableHead>{tCommon('createdAt')}</TableHead>
                <TableHead className="w-[60px] text-right">
                  <span className="sr-only">{tCommon('actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.email}</TableCell>
                  <TableCell>{customer.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.company ?? tCommon('none')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{sourceLabel(t, customer.externalSource)}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {customer.externalRef ?? tCommon('none')}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {dateFormatter.format(customer.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <CustomerRowActions
                      customerId={customer.id}
                      customerName={customer.name}
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

type CustomersT = Awaited<ReturnType<typeof getTranslations<'customers'>>>;

function sourceLabel(t: CustomersT, source: 'manual' | 'stripe' | 'paddle' | 'polar'): string {
  switch (source) {
    case 'manual':
      return t('sourceManual');
    case 'stripe':
      return t('sourceStripe');
    case 'paddle':
      return t('sourcePaddle');
    case 'polar':
      return 'Polar';
  }
}
