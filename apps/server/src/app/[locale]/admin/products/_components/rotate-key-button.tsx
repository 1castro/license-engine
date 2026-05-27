'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { parseAdminApiError } from '@/lib/admin-ui/api-error';

export function RotateKeyButton(props: {
  productId: string;
  productName: string;
  currentKid: string | null;
}) {
  const t = useTranslations('products');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/v1/products/${props.productId}/rotate-key`, {
        method: 'POST',
      });
      if (res.ok) {
        const body = (await res.json()) as { signingKeyId: string };
        setSuccess(body.signingKeyId);
        router.refresh();
        return;
      }
      const err = await parseAdminApiError(res);
      setError(t('rotateKeyFailed', { error: err?.message ?? tCommon('errorGeneric') }));
    } catch {
      setError(t('rotateKeyFailed', { error: tCommon('errorNetwork') }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setError(null);
          setSuccess(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="mr-2 h-4 w-4" />
          {t('rotateKey')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('rotateKey')}</DialogTitle>
          <DialogDescription>
            {t('rotateKeyConfirm', { name: props.productName })}
          </DialogDescription>
        </DialogHeader>

        {props.currentKid && (
          <p className="rounded bg-muted px-3 py-2 font-mono text-xs">
            {t('signingKey')}: {props.currentKid}
          </p>
        )}

        {success && (
          <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
            {t('rotateKeySuccess', { kid: success })}
          </p>
        )}
        {error && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          {success ? (
            <Button onClick={() => setOpen(false)}>{tCommon('back')}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {tCommon('cancel')}
              </Button>
              <Button onClick={onConfirm} disabled={submitting}>
                {submitting ? tCommon('saving') : t('rotateKey')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
