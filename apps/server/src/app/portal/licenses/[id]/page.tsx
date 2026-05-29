import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getPortalSession } from '@/lib/portal/session';
import { getSeatUsage } from '@/lib/binding/activation-service';
import { parseBindingPolicy } from '@/lib/binding/binding-policy';
import { countRejectedForLicense } from '@/lib/services/dashboard-service';
import {
  PortalActivationsView,
  type PortalActivationItem,
} from './portal-activations-view';

export const dynamic = 'force-dynamic';

const SEAT_LABEL: Record<string, string> = {
  account: 'Nutzer',
  device: 'Geräte',
  installation: 'Installationen',
  domain: 'Domain',
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

  const seats = await getSeatUsage(id, parseBindingPolicy(license.bindingPolicy));
  const rejectedCount = await countRejectedForLicense(id);
  const items: PortalActivationItem[] = license.activations.map((a) => {
    const meta = a.bindingValueMetadata as Record<string, unknown> | null;
    return {
      id: a.id,
      bindingType: a.bindingType,
      displayName: meta && typeof meta.displayName === 'string' ? meta.displayName : null,
      identifier: meta && typeof meta.identifier === 'string' ? meta.identifier : null,
      status: a.status,
      activatedAt: a.activatedAt.toISOString(),
      lastSeenAt: a.lastSeenAt.toISOString(),
      releasedAt: a.releasedAt ? a.releasedAt.toISOString() : null,
    };
  });

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

        {seats.length > 0 && (
          <div className="mt-4 border-t border-neutral-100 pt-4">
            <p className="text-xs uppercase text-neutral-500">Plätze</p>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {seats.map((s) => (
                <div key={s.type}>
                  <span className="text-neutral-600">{SEAT_LABEL[s.type] ?? s.type}: </span>
                  <span className="font-medium">
                    {s.used} / {s.max ?? '∞'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Behandeln Sie diese Lizenznummer wie ein Passwort: Wer sie kennt, kann die Lizenz
          aktivieren. Geben Sie sie nicht an Unbefugte weiter.
        </p>

        {rejectedCount > 0 && (
          <p className="mt-2 rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
            Hinweis: Es gab {rejectedCount} abgewiesene{' '}
            {rejectedCount === 1 ? 'Anmeldung' : 'Anmeldungen'} an dieser Lizenz (z.&nbsp;B. weil das
            Platz-Limit erreicht war oder die Zugangsdaten nicht passten). Wenn Ihnen das ungewöhnlich
            vorkommt, melden Sie sich bei uns.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Nutzung &amp; Plätze</h2>
          <p className="text-sm text-neutral-600">
            Hier sehen Sie, wer Ihre Lizenz nutzt. Geben Sie einen Platz frei, wenn ein Mitarbeiter
            oder Gerät ihn nicht mehr braucht — der Platz wird dann für jemand anderen frei.
          </p>
        </div>
        <PortalActivationsView activations={items} seats={seats} />
      </div>
    </div>
  );
}
