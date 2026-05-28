'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

  const [activeType, setActiveType] = useState<string>(shownTypes[0] ?? '');

  if (activations.length === 0) {
    return (
      <p className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
        Diese Lizenz wird aktuell nicht genutzt.
      </p>
    );
  }

  // Guard against a stale activeType (e.g. if the shown types ever change).
  const currentType = shownTypes.some((t) => t === activeType) ? activeType : shownTypes[0];

  return (
    <div className="space-y-4">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-neutral-200">
        {shownTypes.map((type) => {
          const active = type === currentType;
          return (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveType(type)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              {GROUP_LABEL[type] ?? type}
            </button>
          );
        })}
      </div>

      <PortalActivationGroup
        key={currentType}
        seat={seatByType.get(currentType)}
        items={byType.get(currentType) ?? []}
        releasable={RELEASABLE.has(currentType)}
      />
    </div>
  );
}

function PortalActivationGroup({
  seat,
  items,
  releasable,
}: {
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
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {seat ? (
          <p className="text-sm font-medium text-neutral-600">
            {seat.used} von {seat.max ?? '∞'} Plätzen belegt
          </p>
        ) : (
          <span />
        )}
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
      </div>

      {visible.length === 0 ? (
        <p className="rounded border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-400">
          {query.trim() === '' ? 'Kein Platz belegt.' : 'Keine Treffer.'}
        </p>
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Kürzel</TableHead>
                <TableHead>Aktiv seit</TableHead>
                <TableHead>Zuletzt aktiv</TableHead>
                <TableHead>Status</TableHead>
                {releasable && <TableHead className="text-right">Aktion</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    {a.displayName ?? <span className="text-neutral-500">(ohne Name)</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-neutral-500">
                    {a.identifier ?? <span className="text-neutral-300">—</span>}
                  </TableCell>
                  <TableCell className="text-neutral-600">
                    {new Date(a.activatedAt).toLocaleDateString('de-DE')}
                  </TableCell>
                  <TableCell className="text-neutral-600">
                    {new Date(a.lastSeenAt).toLocaleDateString('de-DE')}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        a.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-neutral-200 text-neutral-700'
                      }`}
                    >
                      {a.status === 'active' ? 'Aktiv' : 'Freigegeben'}
                    </span>
                  </TableCell>
                  {releasable && (
                    <TableCell className="text-right">
                      {a.status === 'active' ? (
                        <ReleaseActivationButton activationId={a.id} />
                      ) : a.releasedAt ? (
                        <span className="text-xs text-neutral-400">
                          freigegeben {new Date(a.releasedAt).toLocaleDateString('de-DE')}
                        </span>
                      ) : null}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
