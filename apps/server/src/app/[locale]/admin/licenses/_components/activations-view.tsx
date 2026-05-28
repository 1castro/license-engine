'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ReleaseActivationButton } from './release-activation-button';

export interface ActivationItem {
  id: string;
  bindingType: string;
  hashPreview: string;
  displayName: string | null;
  /** Short, human-readable identifier (e.g. username / member ID), if provided. */
  identifier: string | null;
  status: 'active' | 'released';
  activatedAt: string;
  lastSeenAt: string;
  releasedAt: string | null;
}

export interface SeatItem {
  type: string;
  used: number;
  max: number | null;
}

const ORDER = ['account', 'domain', 'device', 'installation'] as const;
const PAGE_SIZE = 10;
const SEARCH_THRESHOLD = 6;

export function ActivationsView({
  licenseId,
  activations,
  seats,
}: {
  licenseId: string;
  activations: ActivationItem[];
  seats: SeatItem[];
}) {
  const t = useTranslations('activations');
  const groupLabel: Record<string, string> = {
    account: t('groupAccount'),
    domain: t('groupDomain'),
    device: t('groupDevice'),
    installation: t('groupInstallation'),
  };

  const seatByType = new Map(seats.map((s) => [s.type, s]));
  const byType = new Map<string, ActivationItem[]>();
  for (const a of activations) {
    const list = byType.get(a.bindingType) ?? [];
    list.push(a);
    byType.set(a.bindingType, list);
  }
  const shownTypes = ORDER.filter(
    (type) => seatByType.has(type) || (byType.get(type)?.length ?? 0) > 0,
  );

  if (activations.length === 0) {
    return (
      <p className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
        {t('empty')}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {shownTypes.map((type) => (
        <ActivationGroup
          key={type}
          licenseId={licenseId}
          label={groupLabel[type]}
          seat={seatByType.get(type)}
          items={byType.get(type) ?? []}
        />
      ))}
    </div>
  );
}

function ActivationGroup({
  licenseId,
  label,
  seat,
  items,
}: {
  licenseId: string;
  label: string;
  seat: SeatItem | undefined;
  items: ActivationItem[];
}) {
  const t = useTranslations('activations');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return items;
    return items.filter(
      (a) =>
        (a.displayName?.toLowerCase().includes(q) ?? false) ||
        (a.identifier?.toLowerCase().includes(q) ?? false) ||
        a.hashPreview.toLowerCase().includes(q),
    );
  }, [items, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const showSearch = items.length > SEARCH_THRESHOLD;

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between border-b border-neutral-200 pb-1">
        <h2 className="text-sm font-semibold text-neutral-900">{label}</h2>
        {seat && (
          <span className="text-sm font-medium text-neutral-600">
            {seat.used} / {seat.max ?? '∞'}
          </span>
        )}
      </div>

      {showSearch && (
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder={t('searchPlaceholder')}
          className="max-w-xs"
        />
      )}

      {visible.length === 0 ? (
        <p className="px-1 py-2 text-sm text-neutral-400">
          {query.trim() === '' ? t('groupEmpty') : t('noResults')}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((a) => (
            <li
              key={a.id}
              className="flex items-start justify-between rounded border border-neutral-200 bg-white p-4 text-sm"
            >
              <div>
                <p className="font-medium">
                  {a.displayName ?? <span className="text-neutral-500">{t('noDisplayName')}</span>}
                  {a.identifier && (
                    <span className="ml-2 font-mono text-xs font-normal text-neutral-500">
                      {a.identifier}
                    </span>
                  )}
                </p>
                <p className="mt-1 font-mono text-xs text-neutral-400">
                  {t('hashLabel')} {a.hashPreview}…
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {t('activatedAt')}: {new Date(a.activatedAt).toLocaleString('de-DE')}
                  {' · '}
                  {t('lastSeen')}: {new Date(a.lastSeenAt).toLocaleString('de-DE')}
                  {a.releasedAt && (
                    <>
                      {' · '}
                      {t('releasedAt')}: {new Date(a.releasedAt).toLocaleString('de-DE')}
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
                  <ReleaseActivationButton licenseId={licenseId} activationId={a.id} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-3 pt-1 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            {t('prev')}
          </Button>
          <span className="text-neutral-500">
            {t('pageOf', { page: safePage + 1, total: pageCount })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            {t('next')}
          </Button>
        </div>
      )}
    </section>
  );
}
