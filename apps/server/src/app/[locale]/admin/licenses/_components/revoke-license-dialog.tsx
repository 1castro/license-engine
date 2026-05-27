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

export function RevokeLicenseDialog({
  open,
  onOpenChange,
  licenseId,
  licenseKey,
}: Props) {
  const t = useTranslations('licenses');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRevoke() {
    if (reason.trim().length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/v1/licenses/${licenseId}/revoke`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reason.trim() }),
        },
      );
      if (res.ok) {
        onOpenChange(false);
        setReason('');
        router.refresh();
        return;
      }
      const err = await parseAdminApiError(res);
      if (err?.code === 'already_revoked') {
        setError(t('errorAlreadyRevoked'));
      } else {
        setError(err?.message ?? tCommon('errorGeneric'));
      }
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
          <DialogTitle>{t('revokeTitle')}</DialogTitle>
          <DialogDescription>
            {t('revokeConfirm', { licenseKey })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="revoke-reason">{t('revokeReason')}</Label>
          <Textarea
            id="revoke-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('revokeReasonPlaceholder')}
            rows={4}
            maxLength={500}
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleRevoke}
            disabled={submitting || reason.trim().length === 0}
          >
            {submitting ? tCommon('saving') : t('revoke')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
