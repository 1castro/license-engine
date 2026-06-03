'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, MoreHorizontal, PauseCircle, Pencil, PlayCircle, Users } from 'lucide-react';
import type { LicenseStatus } from '@prisma/client';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { RevokeLicenseDialog } from './revoke-license-dialog';
import { SuspendLicenseDialog } from './suspend-license-dialog';
import { ReactivateLicenseDialog } from './reactivate-license-dialog';

export function LicenseRowActions({
  licenseId,
  licenseKey,
  status,
}: {
  licenseId: string;
  licenseKey: string;
  status: LicenseStatus;
}) {
  const t = useTranslations('common');
  const tLicenses = useTranslations('licenses');
  const tActivations = useTranslations('activations');
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);

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
          <DropdownMenuItem asChild>
            <Link href={`/admin/licenses/${licenseId}/activations`}>
              <Users className="mr-2 h-4 w-4" />
              {tActivations('title')}
            </Link>
          </DropdownMenuItem>
          {/* Pause: only an active license can be paused. Reactivate: only shown
              when paused. Both reversible; revoke stays the terminal action. */}
          {status === 'suspended' ? (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setReactivateOpen(true);
              }}
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              {tLicenses('reactivate')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              disabled={status !== 'active'}
              onSelect={(event) => {
                event.preventDefault();
                setSuspendOpen(true);
              }}
            >
              <PauseCircle className="mr-2 h-4 w-4" />
              {tLicenses('suspend')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={status === 'revoked'}
            onSelect={(event) => {
              event.preventDefault();
              setRevokeOpen(true);
            }}
            className="text-destructive focus:text-destructive"
          >
            <Ban className="mr-2 h-4 w-4" />
            {tLicenses('revoke')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RevokeLicenseDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        licenseId={licenseId}
        licenseKey={licenseKey}
      />
      <SuspendLicenseDialog
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        licenseId={licenseId}
        licenseKey={licenseKey}
      />
      <ReactivateLicenseDialog
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        licenseId={licenseId}
        licenseKey={licenseKey}
      />
    </>
  );
}
