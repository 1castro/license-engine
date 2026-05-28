'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { parseAdminApiError } from '@/lib/admin-ui/api-error';

/** Inline confirm modal — never the native confirm(). Releases one seat. */
export function ReleaseActivationButton({
  licenseId,
  activationId,
}: {
  licenseId: string;
  activationId: string;
}) {
  const t = useTranslations('activations');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/v1/licenses/${licenseId}/activations/${activationId}/release`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const err = await parseAdminApiError(res);
        setError(err?.message ?? tCommon('errorGeneric'));
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError(tCommon('errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t('release')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('releaseTitle')}</DialogTitle>
          <DialogDescription>{t('releaseConfirm')}</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            {tCommon('cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={submitting}>
            {submitting ? tCommon('saving') : t('release')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
