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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { parseAdminApiError } from '@/lib/admin-ui/api-error';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  licenseId: string;
  licenseKey: string;
}

/** Pause a license (reversible). Reason is optional. Seats are held. */
export function SuspendLicenseDialog({ open, onOpenChange, licenseId, licenseKey }: Props) {
  const t = useTranslations('licenses');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSuspend() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/v1/licenses/${licenseId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Reason optional — only send it when filled.
        body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}),
      });
      if (res.ok) {
        onOpenChange(false);
        setReason('');
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
          <DialogTitle>{t('suspendTitle')}</DialogTitle>
          <DialogDescription>{t('suspendConfirm', { licenseKey })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="suspend-reason">
            {t('suspendReason')}{' '}
            <span className="font-normal text-muted-foreground">({tCommon('optional')})</span>
          </Label>
          <Textarea
            id="suspend-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('suspendReasonPlaceholder')}
            rows={3}
            maxLength={500}
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {tCommon('cancel')}
          </Button>
          <Button type="button" onClick={handleSuspend} disabled={submitting}>
            {submitting ? tCommon('saving') : t('suspend')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
