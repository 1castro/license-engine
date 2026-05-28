'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Copy, Plus } from 'lucide-react';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { parseAdminApiError } from '@/lib/admin-ui/api-error';

// Mirrors lib/auth/api-key-middleware.ts → ALL_SCOPES, kept here as a literal
// so the client bundle doesn't pull in server-only modules from that import path.
const ALL_SCOPES = [
  'products:read',
  'products:write',
  'customers:read',
  'customers:write',
  'licenses:read',
  'licenses:write',
  'licenses:revoke',
  'activations:read',
  'activations:write',
  'audit:read',
] as const;

export function CreateApiKeyDialog() {
  const t = useTranslations('apiKeys');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [licenseId, setLicenseId] = useState('');
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setScopes([]);
    setLicenseId('');
    setPlaintext(null);
    setCopied(false);
    setError(null);
    setSubmitting(false);
  }

  async function handleSubmit() {
    if (name.trim().length === 0 || scopes.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const trimmedLicenseId = licenseId.trim();
      const res = await fetch('/api/admin/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          scopes,
          ...(trimmedLicenseId.length > 0 ? { licenseId: trimmedLicenseId } : {}),
        }),
      });
      if (res.ok) {
        const data: unknown = await res.json();
        if (
          data &&
          typeof data === 'object' &&
          'plaintext' in data &&
          typeof (data as { plaintext: unknown }).plaintext === 'string'
        ) {
          setPlaintext((data as { plaintext: string }).plaintext);
        }
        router.refresh();
      } else {
        const err = await parseAdminApiError(res);
        setError(err?.message ?? tCommon('errorGeneric'));
      }
    } catch {
      setError(tCommon('errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  }

  async function copyToClipboard() {
    if (!plaintext) return;
    try {
      await navigator.clipboard.writeText(plaintext);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      // No-op: clipboard write can fail in non-secure contexts.
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t('createNew')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('createTitle')}</DialogTitle>
          {!plaintext && (
            <DialogDescription>{t('scopesHint')}</DialogDescription>
          )}
        </DialogHeader>

        {plaintext ? (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTitle>{t('plaintextWarning')}</AlertTitle>
              <AlertDescription className="mt-2 break-all font-mono text-xs">
                {plaintext}
              </AlertDescription>
            </Alert>
            <Button type="button" onClick={copyToClipboard} variant="outline">
              <Copy className="mr-2 h-4 w-4" />
              {copied ? t('copied') : t('copyToClipboard')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key-name">{t('name')}</Label>
              <Input
                id="api-key-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('scopes')}</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_SCOPES.map((scope) => {
                  const checked = scopes.includes(scope);
                  return (
                    <label
                      key={scope}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) => {
                          if (next === true) {
                            setScopes((prev) => [...prev, scope]);
                          } else {
                            setScopes((prev) =>
                              prev.filter((s) => s !== scope),
                            );
                          }
                        }}
                      />
                      <span className="font-mono text-xs">{scope}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key-license">{t('licenseBindingLabel')}</Label>
              <Input
                id="api-key-license"
                value={licenseId}
                onChange={(event) => setLicenseId(event.target.value)}
                placeholder={t('licenseBindingPlaceholder')}
                autoComplete="off"
              />
              <p className="text-xs text-neutral-500">{t('licenseBindingHint')}</p>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          {plaintext ? (
            <Button
              type="button"
              onClick={() => handleOpenChange(false)}
              variant="default"
            >
              {t('close')}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                {tCommon('cancel')}
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={
                  submitting || name.trim().length === 0 || scopes.length === 0
                }
              >
                {submitting ? tCommon('creating') : tCommon('create')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
