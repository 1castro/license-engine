import { redirect } from 'next/navigation';
import { getPortalSession } from '@/lib/portal/session';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function PortalLoginPage() {
  const session = await getPortalSession();
  if (session) redirect('/portal');

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-semibold">Anmeldung</h1>
      <LoginForm />
    </div>
  );
}
