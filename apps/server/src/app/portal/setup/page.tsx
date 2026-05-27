import { Suspense } from 'react';
import { PasswordTokenForm } from '../_components/password-token-form';

export const dynamic = 'force-dynamic';

export default function PortalSetupPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 text-2xl font-semibold">Passwort festlegen</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Setze dein Passwort, um Zugang zu deinen Lizenzen zu erhalten.
      </p>
      <Suspense fallback={null}>
        <PasswordTokenForm endpoint="/api/portal/v1/setup-password" successHref="/portal/login" />
      </Suspense>
    </div>
  );
}
