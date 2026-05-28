'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mail, MoreHorizontal, Pencil, Trash } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { DeleteCustomerDialog } from './delete-customer-dialog';
import { ResendSetupDialog } from './resend-setup-dialog';

export function CustomerRowActions({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  const t = useTranslations('common');
  const tCustomers = useTranslations('customers');
  const [open, setOpen] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('openMenu')}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/admin/customers/${customerId}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              {t('edit')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setResendOpen(true);
            }}
          >
            <Mail className="mr-2 h-4 w-4" />
            {tCustomers('resendSetupAction')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setOpen(true);
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash className="mr-2 h-4 w-4" />
            {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteCustomerDialog
        open={open}
        onOpenChange={setOpen}
        customerId={customerId}
        customerName={customerName}
      />
      <ResendSetupDialog
        open={resendOpen}
        onOpenChange={setResendOpen}
        customerId={customerId}
        customerName={customerName}
      />
    </>
  );
}
