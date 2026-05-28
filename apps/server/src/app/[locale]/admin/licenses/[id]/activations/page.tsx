import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import { getSeatUsage, listActivationsForLicense } from '@/lib/binding/activation-service';
import { parseBindingPolicy } from '@/lib/binding/binding-policy';
import { ReleaseActivationButton } from '../../_components/release-activation-button';

export const dynamic = 'force-dynamic';

export default async function LicenseActivationsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('activations');
  const tCommon = await getTranslations('common');

  const license = await prisma.license.findUnique({
    where: { id },
    include: { product: { select: { name: true } }, customer: { select: { name: true } } },
  });
  if (!license) notFound();

  const [activations, seats] = await Promise.all([
    listActivationsForLicense(id),
    getSeatUsage(id, parseBindingPolicy(license.bindingPolicy)),
  ]);

  // Group activations by binding type for a clean per-type layout.
  const ORDER = ['account', 'domain', 'device', 'installation'] as const;
  const groupLabel: Record<string, string> = {
    account: t('groupAccount'),
    domain: t('groupDomain'),
    device: t('groupDevice'),
    installation: t('groupInstallation'),
  };
  const seatByType = new Map(seats.map((s) => [s.type, s]));
  const byType = new Map<string, typeof activations>();
  for (const a of activations) {
    const list = byType.get(a.bindingType) ?? [];
    list.push(a);
    byType.set(a.bindingType, list);
  }
  // Show a section per type that has a configured seat OR existing activations.
  const shownTypes = ORDER.filter(
    (type) => seatByType.has(type) || (byType.get(type)?.length ?? 0) > 0,
  );

  return (
    <div className="space-y-6">
      <Link href="/admin/licenses" className="text-sm text-neutral-600 underline">
        ← {tCommon('back')}
      </Link>

      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="mt-1 font-mono text-sm text-neutral-600">{license.licenseKey}</p>
        <p className="text-sm text-neutral-500">
          {license.customer.name} · {license.product.name}
        </p>
      </div>

      {activations.length === 0 ? (
        <p className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
          {t('empty')}
        </p>
      ) : (
        <div className="space-y-6">
          {shownTypes.map((type) => {
            const items = byType.get(type) ?? [];
            const seat = seatByType.get(type);
            return (
              <section key={type} className="space-y-2">
                <div className="flex items-baseline justify-between border-b border-neutral-200 pb-1">
                  <h2 className="text-sm font-semibold text-neutral-900">{groupLabel[type]}</h2>
                  {seat && (
                    <span className="text-sm font-medium text-neutral-600">
                      {seat.used} / {seat.max ?? '∞'}
                    </span>
                  )}
                </div>
                {items.length === 0 ? (
                  <p className="px-1 py-2 text-sm text-neutral-400">{t('groupEmpty')}</p>
                ) : (
                  <ul className="space-y-2">
                    {items.map((a) => {
                      const meta = a.bindingValueMetadata as Record<string, unknown> | null;
                      const displayName =
                        meta && typeof meta.displayName === 'string' ? meta.displayName : null;
                      return (
                        <li
                          key={a.id}
                          className="flex items-start justify-between rounded border border-neutral-200 bg-white p-4 text-sm"
                        >
                          <div>
                            <p className="font-medium">
                              {displayName ?? (
                                <span className="text-neutral-500">{t('noDisplayName')}</span>
                              )}
                            </p>
                            <p className="mt-1 font-mono text-xs text-neutral-400">
                              {t('hashLabel')} {a.bindingValueHash.slice(0, 16)}…
                            </p>
                            <p className="mt-1 text-xs text-neutral-500">
                              {t('activatedAt')}: {a.activatedAt.toLocaleString('de-DE')}
                              {' · '}
                              {t('lastSeen')}: {a.lastSeenAt.toLocaleString('de-DE')}
                              {a.releasedAt && (
                                <>
                                  {' · '}
                                  {t('releasedAt')}: {a.releasedAt.toLocaleString('de-DE')}
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
                              {a.status === 'active' ? t('statusActive') : t('statusReleased')}
                            </span>
                            {a.status === 'active' && (
                              <ReleaseActivationButton licenseId={id} activationId={a.id} />
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
