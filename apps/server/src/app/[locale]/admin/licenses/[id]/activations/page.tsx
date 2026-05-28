import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import { getSeatUsage, listActivationsForLicense } from '@/lib/binding/activation-service';
import { parseBindingPolicy } from '@/lib/binding/binding-policy';
import {
  ActivationsView,
  type ActivationItem,
} from '../../_components/activations-view';

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

  const items: ActivationItem[] = activations.map((a) => {
    const meta = a.bindingValueMetadata as Record<string, unknown> | null;
    return {
      id: a.id,
      bindingType: a.bindingType,
      hashPreview: a.bindingValueHash.slice(0, 16),
      displayName: meta && typeof meta.displayName === 'string' ? meta.displayName : null,
      status: a.status,
      activatedAt: a.activatedAt.toISOString(),
      lastSeenAt: a.lastSeenAt.toISOString(),
      releasedAt: a.releasedAt ? a.releasedAt.toISOString() : null,
    };
  });

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

      <ActivationsView licenseId={id} activations={items} seats={seats} />
    </div>
  );
}
