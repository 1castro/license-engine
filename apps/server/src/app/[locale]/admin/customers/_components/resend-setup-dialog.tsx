'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { parseAdminApiError } from '@/lib/admin-ui/api-error';

/** Confirms + triggers re-sending the portal setup mail for a customer. */
export function ResendSetupDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
}) {
  const t = useTranslations('customers');
  const tCommon = useTranslations('common');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setError(null);
      setDone(false);
    }
    onOpenChange(next);
  }

  async function onConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/v1/customers/${customerId}/resend-setup`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await parseAdminApiError(res);
        setError(err?.message ?? tCommon('errorGeneric'));
        return;
      }
      setDone(true);
    } catch {
      setError(tCommon('errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('resendSetupTitle')}</DialogTitle>
          <DialogDescription>{t('resendSetupConfirm', { name: customerName })}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {done && (
          <Alert>
            <AlertDescription>{t('resendSetupDone')}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          {done ? (
            <Button onClick={() => handleOpenChange(false)}>{tCommon('close')}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
                {tCommon('cancel')}
              </Button>
              <Button onClick={onConfirm} disabled={submitting}>
                {submitting ? tCommon('saving') : t('resendSetupAction')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
