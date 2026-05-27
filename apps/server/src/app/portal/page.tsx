import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getPortalSession } from '@/lib/portal/session';
import { LogoutButton } from './_components/logout-button';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  active: 'Aktiv',
  revoked: 'Widerrufen',
  expired: 'Abgelaufen',
};

const STATUS_CLASS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  revoked: 'bg-red-100 text-red-800',
  expired: 'bg-neutral-200 text-neutral-700',
};

export default async function PortalDashboardPage() {
  const session = await getPortalSession();
  if (!session) redirect('/portal/login');

  const customer = await prisma.customer.findUnique({
    where: { id: session.customerId },
    include: {
      licenses: {
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { slug: true, name: true } },
          activations: { where: { status: 'active' }, select: { id: true } },
        },
      },
    },
  });

  if (!customer) {
    redirect('/portal/login');
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Meine Lizenzen</h1>
          <p className="text-sm text-neutral-600">
            Angemeldet als {customer.name} ({customer.email})
          </p>
        </div>
        <LogoutButton />
      </div>

      {customer.licenses.length === 0 ? (
        <p className="rounded border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
          Du hast aktuell keine Lizenzen.
        </p>
      ) : (
        <div className="space-y-3">
          {customer.licenses.map((l) => {
            const statusKey = l.status;
            const expiresAtLabel = l.expiresAt
              ? l.expiresAt.toLocaleDateString('de-DE')
              : 'Unbefristet';
            return (
              <a
                key={l.id}
                href={`/portal/licenses/${l.id}`}
                className="block rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-400"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm">{l.licenseKey}</p>
                    <p className="text-xs text-neutral-600">{l.product.name}</p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium ${STATUS_CLASS[statusKey] ?? ''}`}
                    >
                      {STATUS_LABEL[statusKey] ?? statusKey}
                    </span>
                    <span className="text-neutral-600">
                      {l.activations.length} aktive Aktivierung{l.activations.length === 1 ? '' : 'en'}
                    </span>
                    <span className="text-neutral-500">Läuft ab: {expiresAtLabel}</span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
