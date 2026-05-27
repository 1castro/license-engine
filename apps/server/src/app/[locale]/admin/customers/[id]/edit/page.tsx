import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Link, redirect } from '@/i18n/navigation';
import { getCustomer } from '@/lib/services/customer-service';

import { CustomerForm } from '../../_components/customer-form';

export const dynamic = 'force-dynamic';

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const customer = await getCustomer(id);
  if (!customer) {
    redirect({ href: '/admin/customers', locale });
    return null;
  }

  const [t, tCommon] = await Promise.all([
    getTranslations('customers'),
    getTranslations('common'),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/customers">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tCommon('back')}
          </Link>
        </Button>
      </div>
      <h1 className="text-2xl font-semibold">{t('editTitle')}</h1>
      <CustomerForm
        mode="edit"
        initial={{
          id: customer.id,
          email: customer.email,
          name: customer.name,
          company: customer.company,
          notes: customer.notes,
          externalRef: customer.externalRef,
          externalSource: customer.externalSource,
        }}
      />
    </div>
  );
}
