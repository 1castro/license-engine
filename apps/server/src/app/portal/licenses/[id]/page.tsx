import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getPortalSession } from '@/lib/portal/session';
import { ReleaseActivationButton } from './release-button';

export const dynamic = 'force-dynamic';

const BINDING_LABEL: Record<string, string> = {
  domain: 'Domain',
  device: 'Gerät',
  account: 'Account',
  installation: 'Installation',
};

const ACTIVATION_STATUS_LABEL: Record<string, string> = {
  active: 'Aktiv',
  released: 'Freigegeben',
};

export default async function PortalLicenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getPortalSession();
  if (!session) redirect('/portal/login');
  const { id } = await params;

  const license = await prisma.license.findUnique({
    where: { id },
    include: {
      product: { select: { name: true, slug: true } },
      activations: { orderBy: { activatedAt: 'desc' } },
    },
  });
  // 404 if it's not ours.
  if (!license || license.customerId !== session.customerId) {
    redirect('/portal');
  }

  const features = Array.isArray(license.featureFlags)
    ? (license.featureFlags.filter((f) => typeof f === 'string') as string[])
    : [];

  return (
    <div className="space-y-6">
      <a href="/portal" className="text-sm text-neutral-600 underline">
        ← Zurück zur Übersicht
      </a>

      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <h1 className="font-mono text-xl">{license.licenseKey}</h1>
        <p className="mt-1 text-sm text-neutral-600">{license.product.name}</p>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase text-neutral-500">Status</dt>
            <dd>{license.status}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-neutral-500">Typ</dt>
            <dd>{license.type === 'subscription' ? 'Abonnement' : 'Unbefristet'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-neutral-500">Läuft ab</dt>
            <dd>
              {license.expiresAt ? license.expiresAt.toLocaleDateString('de-DE') : 'Unbefristet'}
            </dd>
          </div>
          {features.length > 0 && (
            <div className="sm:col-span-3">
              <dt className="text-xs uppercase text-neutral-500">Features</dt>
              <dd className="flex flex-wrap gap-2">
                {features.map((f) => (
                  <span
                    key={f}
                    className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs"
                  >
                    {f}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Aktivierungen</h2>
        {license.activations.length === 0 ? (
          <p className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
            Diese Lizenz wurde noch nicht aktiviert.
          </p>
        ) : (
          <ul className="space-y-2">
            {license.activations.map((a) => (
              <li
                key={a.id}
                className="flex items-start justify-between rounded border border-neutral-200 bg-white p-4 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {BINDING_LABEL[a.bindingType] ?? a.bindingType}
                    {(() => {
                      const meta = a.bindingValueMetadata as Record<string, unknown> | null;
                      const displayName =
                        meta && typeof meta.displayName === 'string' ? meta.displayName : null;
                      return displayName ? (
                        <span className="ml-2 font-normal text-neutral-700">— {displayName}</span>
                      ) : null;
                    })()}
                  </p>
                  {(() => {
                    const meta = a.bindingValueMetadata as Record<string, unknown> | null;
                    const ua = meta && typeof meta.userAgent === 'string' ? meta.userAgent : null;
                    const runtime =
                      meta && typeof meta.runtime === 'string' ? meta.runtime : null;
                    const subtitle = [runtime, ua].filter(Boolean).join(' · ');
                    return subtitle ? (
                      <p className="mt-0.5 text-xs text-neutral-600">{subtitle}</p>
                    ) : null;
                  })()}
                  <p className="mt-1 font-mono text-xs text-neutral-400">
                    Hash {a.bindingValueHash.slice(0, 16)}…
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Aktiviert: {a.activatedAt.toLocaleString('de-DE')}
                    {' · '}Zuletzt gesehen: {a.lastSeenAt.toLocaleString('de-DE')}
                    {a.releasedAt && (
                      <>
                        {' · '}Freigegeben: {a.releasedAt.toLocaleString('de-DE')}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      a.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-neutral-200 text-neutral-700'
                    }`}
                  >
                    {ACTIVATION_STATUS_LABEL[a.status] ?? a.status}
                  </span>
                  {a.status === 'active' && <ReleaseActivationButton activationId={a.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
