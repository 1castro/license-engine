'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, MoreHorizontal, Pencil } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { RevokeLicenseDialog } from './revoke-license-dialog';

export function LicenseRowActions({
  licenseId,
  licenseKey,
  isRevoked,
}: {
  licenseId: string;
  licenseKey: string;
  isRevoked: boolean;
}) {
  const t = useTranslations('common');
  const tLicenses = useTranslations('licenses');
  const [open, setOpen] = useState(false);

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
            <Link href={`/admin/licenses/${licenseId}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              {t('edit')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isRevoked}
            onSelect={(event) => {
              event.preventDefault();
              setOpen(true);
            }}
            className="text-destructive focus:text-destructive"
          >
            <Ban className="mr-2 h-4 w-4" />
            {tLicenses('revoke')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RevokeLicenseDialog
        open={open}
        onOpenChange={setOpen}
        licenseId={licenseId}
        licenseKey={licenseKey}
      />
    </>
  );
}
