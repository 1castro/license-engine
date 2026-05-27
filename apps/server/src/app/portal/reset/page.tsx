import { Suspense } from 'react';
import { PasswordTokenForm } from '../_components/password-token-form';

export const dynamic = 'force-dynamic';

export default function PortalResetPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 text-2xl font-semibold">Passwort zurücksetzen</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Setze ein neues Passwort, um wieder Zugang zu erhalten.
      </p>
      <Suspense fallback={null}>
        <PasswordTokenForm endpoint="/api/portal/v1/reset-password" successHref="/portal/login" />
      </Suspense>
    </div>
  );
}
