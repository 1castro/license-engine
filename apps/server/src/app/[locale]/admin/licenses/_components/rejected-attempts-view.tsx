import { getTranslations } from 'next-intl/server';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { RejectedEntry } from '@/lib/services/dashboard-service';

/**
 * Read-only list of refused activation attempts for one license (admin view).
 * Shows the full forensic context: time, reason, binding type, attempted
 * value/name and the hashed IP.
 */
export async function RejectedAttemptsView({ entries }: { entries: RejectedEntry[] }) {
  const t = await getTranslations('activations');

  function reasonLabel(e: RejectedEntry): string {
    if (e.reason === 'limit_erreicht') {
      // Domain max_exceeded means "domain seat quota full", NOT an allowlist
      // rejection — the engine has no domain authorization check. Label it as a
      // limit, not as "unauthorized domain", so admins don't misread a quota
      // overflow (upsell case) as an attack.
      return e.bindingType === 'domain' ? t('reasonDomainLimit') : t('reasonLimit');
    }
    switch (e.reason) {
      case 'key_ungültig':
        return t('reasonKeyInvalid');
      case 'lizenz_unbekannt':
        return t('reasonUnknownLicense');
      case 'lizenz_inaktiv':
        return t('reasonInactive');
      case 'lizenz_abgelaufen':
        return t('reasonExpired');
      case 'pflichtbindung_fehlt':
        return t('reasonMissingBinding');
      default:
        return t('reasonUnknown');
    }
  }

  function attemptedLabel(e: RejectedEntry): string {
    if (e.attemptedBindings.length === 0) return '—';
    return e.attemptedBindings
      .map((b) => (b.displayName ? `${b.displayName} (${b.value})` : `${b.type}: ${b.value}`))
      .join(', ');
  }

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between border-b border-neutral-200 pb-1">
        <h2 className="text-sm font-semibold text-neutral-900">{t('rejectsTitle')}</h2>
        <span className="text-sm font-medium text-neutral-600">{entries.length}</span>
      </div>

      {entries.length === 0 ? (
        <p className="rounded border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-400">
          {t('rejectsEmpty')}
        </p>
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('rejectsColTime')}</TableHead>
                <TableHead>{t('rejectsColReason')}</TableHead>
                <TableHead>{t('rejectsColAttempted')}</TableHead>
                <TableHead>{t('rejectsColIp')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-neutral-600">
                    {new Date(e.timestamp).toLocaleString('de-DE')}
                  </TableCell>
                  <TableCell>
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      {reasonLabel(e)}
                    </span>
                  </TableCell>
                  <TableCell className="text-neutral-700">{attemptedLabel(e)}</TableCell>
                  <TableCell className="font-mono text-xs text-neutral-400">
                    {e.ipHash ? e.ipHash.slice(0, 12) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
