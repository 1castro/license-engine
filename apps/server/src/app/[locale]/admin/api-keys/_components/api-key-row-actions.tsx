'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, MoreHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { RevokeApiKeyDialog } from './revoke-api-key-dialog';

export function ApiKeyRowActions({
  apiKeyId,
  apiKeyName,
  isRevoked,
}: {
  apiKeyId: string;
  apiKeyName: string;
  isRevoked: boolean;
}) {
  const t = useTranslations('common');
  const tApi = useTranslations('apiKeys');
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
          <DropdownMenuItem
            disabled={isRevoked}
            onSelect={(event) => {
              event.preventDefault();
              setOpen(true);
            }}
            className="text-destructive focus:text-destructive"
          >
            <Ban className="mr-2 h-4 w-4" />
            {tApi('revoke')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RevokeApiKeyDialog
        open={open}
        onOpenChange={setOpen}
        apiKeyId={apiKeyId}
        apiKeyName={apiKeyName}
      />
    </>
  );
}
