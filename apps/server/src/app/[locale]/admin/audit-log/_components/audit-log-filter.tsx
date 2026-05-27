'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ACTOR_TYPES = ['admin', 'api_key', 'system', 'anonymous'] as const;

export function AuditLogFilter(props: {
  initial: {
    eventType?: string;
    actorType?: string;
    from?: string;
    until?: string;
  };
}) {
  const t = useTranslations('auditLog');
  const router = useRouter();

  const [eventType, setEventType] = useState(props.initial.eventType ?? '');
  const [actorType, setActorType] = useState(props.initial.actorType ?? '');
  const [from, setFrom] = useState(props.initial.from?.slice(0, 16) ?? '');
  const [until, setUntil] = useState(props.initial.until?.slice(0, 16) ?? '');

  function buildHref(params: {
    eventType: string;
    actorType: string;
    from: string;
    until: string;
  }): string {
    const sp = new URLSearchParams();
    if (params.eventType) sp.set('eventType', params.eventType);
    if (params.actorType) sp.set('actorType', params.actorType);
    if (params.from) sp.set('from', new Date(params.from).toISOString());
    if (params.until) sp.set('until', new Date(params.until).toISOString());
    const qs = sp.toString();
    return qs ? `?${qs}` : '';
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    router.push(`/admin/audit-log${buildHref({ eventType, actorType, from, until })}`);
  }

  function onReset() {
    setEventType('');
    setActorType('');
    setFrom('');
    setUntil('');
    router.push('/admin/audit-log');
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-md border bg-card p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="eventType">{t('filterEventType')}</Label>
          <Input
            id="eventType"
            placeholder="z.B. license.created"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="actorType">{t('filterActorType')}</Label>
          <Select
            value={actorType || 'all'}
            onValueChange={(v) => setActorType(v === 'all' ? '' : v)}
          >
            <SelectTrigger id="actorType">
              <SelectValue placeholder={t('filterAll')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filterAll')}</SelectItem>
              {ACTOR_TYPES.map((a) => (
                <SelectItem key={a} value={a}>
                  {t(`actor${a === 'api_key' ? 'ApiKey' : a.charAt(0).toUpperCase() + a.slice(1)}` as never)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="from">{t('filterFrom')}</Label>
          <Input
            id="from"
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="until">{t('filterUntil')}</Label>
          <Input
            id="until"
            type="datetime-local"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button type="button" variant="outline" onClick={onReset}>
          {t('reset')}
        </Button>
        <Button type="submit">{t('apply')}</Button>
      </div>
    </form>
  );
}
