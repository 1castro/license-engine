'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function AuditLogPagination(props: {
  offset: number;
  limit: number;
  total: number;
  query: {
    eventType?: string;
    actorType?: string;
    from?: string;
    until?: string;
  };
}) {
  const t = useTranslations('auditLog');
  const router = useRouter();

  const hasPrev = props.offset > 0;
  const hasNext = props.offset + props.limit < props.total;

  function goTo(newOffset: number) {
    const sp = new URLSearchParams();
    if (props.query.eventType) sp.set('eventType', props.query.eventType);
    if (props.query.actorType) sp.set('actorType', props.query.actorType);
    if (props.query.from) sp.set('from', props.query.from);
    if (props.query.until) sp.set('until', props.query.until);
    sp.set('limit', String(props.limit));
    sp.set('offset', String(newOffset));
    router.push(`/admin/audit-log?${sp.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={!hasPrev}
        onClick={() => goTo(Math.max(0, props.offset - props.limit))}
      >
        {t('previous')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!hasNext}
        onClick={() => goTo(props.offset + props.limit)}
      >
        {t('next')}
      </Button>
    </div>
  );
}
