import { ForgotForm } from './forgot-form';

export const dynamic = 'force-dynamic';

export default function PortalForgotPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 text-2xl font-semibold">Passwort vergessen</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Gib deine E-Mail ein. Wenn ein Konto existiert, schicken wir dir einen Reset-Link.
      </p>
      <ForgotForm />
    </div>
  );
}
