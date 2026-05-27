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
  productId: string;
  productName: string;
}

export function DeleteProductDialog({
  open,
  onOpenChange,
  productId,
  productName,
}: Props) {
  const t = useTranslations('products');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/v1/products/${productId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onOpenChange(false);
        router.refresh();
        return;
      }
      const err = await parseAdminApiError(res);
      if (err?.code === 'product_in_use') {
        const count =
          err.details &&
          typeof err.details === 'object' &&
          'licenseCount' in err.details
            ? Number((err.details as { licenseCount: number }).licenseCount)
            : 0;
        setError(t('deleteInUse', { count }));
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
          <DialogTitle>{t('delete')}</DialogTitle>
          <DialogDescription>
            {t('deleteConfirm', { name: productName })}
          </DialogDescription>
        </DialogHeader>
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
            onClick={handleDelete}
            disabled={submitting}
          >
            {submitting ? tCommon('deleting') : tCommon('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
