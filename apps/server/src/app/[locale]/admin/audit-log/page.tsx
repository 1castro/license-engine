import { setRequestLocale, getTranslations } from 'next-intl/server';
import { AuditActorType } from '@prisma/client';
import {
  auditLogQuerySchema,
  listAuditLogs,
} from '@/lib/services/audit-log-service';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AuditLogFilter } from './_components/audit-log-filter';
import { AuditLogPagination } from './_components/audit-log-pagination';

export const dynamic = 'force-dynamic';

const ACTOR_BADGE: Record<AuditActorType, 'default' | 'secondary' | 'outline'> = {
  admin: 'default',
  api_key: 'secondary',
  system: 'outline',
  anonymous: 'outline',
};

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auditLog');

  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') flat[k] = v;
    else if (Array.isArray(v) && typeof v[0] === 'string') flat[k] = v[0];
  }
  const parsed = auditLogQuerySchema.safeParse(flat);
  const query = parsed.success ? parsed.data : auditLogQuerySchema.parse({});

  const page = await listAuditLogs(query);

  const fromIdx = page.entries.length > 0 ? page.offset + 1 : 0;
  const toIdx = page.offset + page.entries.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <AuditLogFilter initial={query} />

      {page.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">{t('timestamp')}</TableHead>
                  <TableHead>{t('event')}</TableHead>
                  <TableHead className="w-32">{t('actor')}</TableHead>
                  <TableHead>{t('target')}</TableHead>
                  <TableHead className="w-32">{t('ipHash')}</TableHead>
                  <TableHead>{t('metadata')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">
                      {e.timestamp.toISOString().replace('T', ' ').slice(0, 19)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{e.eventType}</TableCell>
                    <TableCell>
                      <Badge variant={ACTOR_BADGE[e.actorType]}>{e.actorType}</Badge>
                      {e.actorId && (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {e.actorId.slice(0, 10)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {e.targetType && e.targetId
                        ? `${e.targetType}/${e.targetId.slice(0, 10)}`
                        : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {e.ipHash ? e.ipHash.slice(0, 12) : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {renderMetadata(e.metadata)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t('showingRange', { from: fromIdx, to: toIdx, total: page.total })}
            </p>
            <AuditLogPagination
              offset={page.offset}
              limit={page.limit}
              total={page.total}
              query={query}
            />
          </div>
        </>
      )}
    </div>
  );
}

function renderMetadata(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object' && Object.keys(value).length === 0) return '—';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
