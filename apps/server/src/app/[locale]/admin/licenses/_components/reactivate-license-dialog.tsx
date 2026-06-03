'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { parseAdminApiError } from '@/lib/admin-ui/api-error';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  licenseId: string;
  licenseKey: string;
}

/** Resume a paused license (inline confirm — no native dialog). */
export function ReactivateLicenseDialog({ open, onOpenChange, licenseId, licenseKey }: Props) {
  const t = useTranslations('licenses');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReactivate() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/v1/licenses/${licenseId}/reactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        onOpenChange(false);
        router.refresh();
        return;
      }
      const err = await parseAdminApiError(res);
      setError(err?.code === 'invalid_state' ? t('errorInvalidState') : (err?.message ?? tCommon('errorGeneric')));
    } catch {
      setError(tCommon('errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('reactivateTitle')}</DialogTitle>
          <DialogDescription>{t('reactivateConfirm', { licenseKey })}</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {tCommon('cancel')}
          </Button>
          <Button type="button" onClick={handleReactivate} disabled={submitting}>
            {submitting ? tCommon('saving') : t('reactivate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
