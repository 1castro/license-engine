'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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

/**
 * Inline confirm modal — never use the native browser confirm() (see
 * feedback memory: feedback_no_native_browser_confirm.md).
 */
export function ReleaseActivationButton(props: { activationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/v1/activations/${props.activationId}/release`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        setError(body.error?.message ?? 'Freigeben fehlgeschlagen.');
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError('Netzwerkfehler.');
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
          Freigeben
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aktivierung freigeben</DialogTitle>
          <DialogDescription>
            Diese Aktivierung wirklich freigeben? Die App auf dem Gerät verliert beim nächsten
            Re-Check ihre Lizenz und müsste neu aktiviert werden.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Abbrechen
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={submitting}>
            {submitting ? 'Wird freigegeben…' : 'Freigeben'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
