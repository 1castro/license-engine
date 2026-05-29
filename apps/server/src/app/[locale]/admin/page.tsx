import { getServerSession } from 'next-auth';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { authOptions } from '@/lib/auth/config';
import { Link } from '@/i18n/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  getActiveLicensesOverview,
  getDashboardCounts,
  latestRejectedAt,
  REJECT_WINDOW_DAYS,
} from '@/lib/services/dashboard-service';
import { DashboardRejectsBanner } from './_components/dashboard-rejects-banner';

export const dynamic = 'force-dynamic';

const SEAT_LABEL: Record<string, string> = {
  account: 'Nutzer',
  device: 'Geräte',
  installation: 'Installationen',
  domain: 'Domain',
};

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getServerSession(authOptions);
  const t = await getTranslations('dashboard');

  const [counts, overview, latestReject] = await Promise.all([
    getDashboardCounts(),
    getActiveLicensesOverview(),
    latestRejectedAt(),
  ]);

  // as-needed locale prefix: the default locale (de) has no prefix.
  const auditHref =
    (locale === 'de' ? '' : `/${locale}`) + '/admin/audit-log?eventType=activation.rejected';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-neutral-600">
          {t('welcome', { name: session?.user?.email ?? '' })}
        </p>
      </div>

      <DashboardRejectsBanner
        count={counts.rejectedWindow}
        latestRejectedAt={latestReject ? latestReject.toISOString() : null}
        href={auditHref}
        message={t('bannerRejects', { count: counts.rejectedWindow, days: REJECT_WINDOW_DAYS })}
        closeLabel={t('bannerClose')}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricTile label={t('metricActiveLicenses')} value={counts.activeLicenses} />
        <MetricTile label={t('metricCustomers')} value={counts.customers} />
        <MetricTile label={t('metricProducts')} value={counts.products} />
        <MetricTile
          label={t('metricRejected', { days: REJECT_WINDOW_DAYS })}
          value={counts.rejectedWindow}
          highlight={counts.rejectedWindow > 0}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t('activeLicensesTitle')}</h2>
        {overview.length === 0 ? (
          <p className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
            {t('noLicenses')}
          </p>
        ) : (
          <div className="rounded-lg border border-neutral-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('colCustomer')}</TableHead>
                  <TableHead>{t('colProduct')}</TableHead>
                  <TableHead>{t('colSeats')}</TableHead>
                  <TableHead>{t('colRejected')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Link
                        href={`/admin/licenses/${l.id}/activations`}
                        className="font-medium text-neutral-900 hover:underline"
                      >
                        {l.customerName}
                      </Link>
                      <span className="block font-mono text-xs text-neutral-400">
                        {l.licenseKey}
                      </span>
                    </TableCell>
                    <TableCell className="text-neutral-700">{l.productName}</TableCell>
                    <TableCell className="text-neutral-700">
                      {l.seats.length === 0 ? (
                        <span className="text-neutral-400">—</span>
                      ) : (
                        l.seats
                          .map((s) => `${SEAT_LABEL[s.type] ?? s.type} ${s.used}/${s.max ?? '∞'}`)
                          .join(' · ')
                      )}
                    </TableCell>
                    <TableCell>
                      {l.rejectedCount > 0 ? (
                        <Link href={`/admin/licenses/${l.id}/activations`}>
                          <Badge variant="outline" className="border-amber-300 text-amber-800">
                            ⚠ {l.rejectedCount}
                          </Badge>
                        </Link>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border bg-white p-4 ${
        highlight ? 'border-amber-300' : 'border-neutral-200'
      }`}
    >
      <div className={`text-2xl font-semibold ${highlight ? 'text-amber-800' : 'text-neutral-900'}`}>
        {value}
      </div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
    </div>
  );
}
