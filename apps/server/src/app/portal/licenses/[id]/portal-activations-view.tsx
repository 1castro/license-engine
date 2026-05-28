'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ReleaseActivationButton } from './release-button';

export interface PortalActivationItem {
  id: string;
  bindingType: string;
  displayName: string | null;
  identifier: string | null;
  status: 'active' | 'released';
  activatedAt: string;
  lastSeenAt: string;
  releasedAt: string | null;
}

export interface PortalSeatItem {
  type: string;
  used: number;
  max: number | null;
}

// Order: usage-types first, the fixed domain binding last. Customers may release
// the usage types (account/device/installation); the domain is the app's fixed
// license binding and is shown read-only.
const ORDER = ['account', 'device', 'installation', 'domain'] as const;
const GROUP_LABEL: Record<string, string> = {
  account: 'Nutzer',
  device: 'Geräte',
  installation: 'Installationen',
  domain: 'Domain (feste Lizenzbindung)',
};
const RELEASABLE = new Set(['account', 'device', 'installation']);
const PAGE_SIZE = 10;
const SEARCH_THRESHOLD = 6;

export function PortalActivationsView({
  activations,
  seats,
}: {
  activations: PortalActivationItem[];
  seats: PortalSeatItem[];
}) {
  const seatByType = new Map(seats.map((s) => [s.type, s]));
  const byType = new Map<string, PortalActivationItem[]>();
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
        Diese Lizenz wird aktuell nicht genutzt.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {shownTypes.map((type) => (
        <PortalActivationGroup
          key={type}
          label={GROUP_LABEL[type] ?? type}
          seat={seatByType.get(type)}
          items={byType.get(type) ?? []}
          releasable={RELEASABLE.has(type)}
        />
      ))}
    </div>
  );
}

function PortalActivationGroup({
  label,
  seat,
  items,
  releasable,
}: {
  label: string;
  seat: PortalSeatItem | undefined;
  items: PortalActivationItem[];
  releasable: boolean;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return items;
    return items.filter(
      (a) =>
        (a.displayName?.toLowerCase().includes(q) ?? false) ||
        (a.identifier?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between border-b border-neutral-200 pb-1">
        <h2 className="text-sm font-semibold text-neutral-900">{label}</h2>
        {seat && (
          <span className="text-sm font-medium text-neutral-600">
            {seat.used} von {seat.max ?? '∞'} Plätzen belegt
          </span>
        )}
      </div>

      {items.length > SEARCH_THRESHOLD && (
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Suchen (Name oder Kürzel)…"
          className="max-w-xs"
        />
      )}

      {visible.length === 0 ? (
        <p className="px-1 py-2 text-sm text-neutral-400">
          {query.trim() === '' ? 'Kein Platz belegt.' : 'Keine Treffer.'}
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
                  {a.displayName ?? <span className="text-neutral-500">(ohne Name)</span>}
                  {a.identifier && (
                    <span className="ml-2 font-mono text-xs font-normal text-neutral-500">
                      {a.identifier}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Aktiv seit {new Date(a.activatedAt).toLocaleDateString('de-DE')}
                  {' · '}zuletzt aktiv {new Date(a.lastSeenAt).toLocaleDateString('de-DE')}
                  {a.releasedAt && (
                    <> · freigegeben {new Date(a.releasedAt).toLocaleDateString('de-DE')}</>
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
                  {a.status === 'active' ? 'Aktiv' : 'Freigegeben'}
                </span>
                {releasable && a.status === 'active' && (
                  <ReleaseActivationButton activationId={a.id} />
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
            Zurück
          </Button>
          <span className="text-neutral-500">
            Seite {safePage + 1} von {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            Weiter
          </Button>
        </div>
      )}
    </section>
  );
}
