import { getTranslations, setRequestLocale } from 'next-intl/server';

import { listApiKeys } from '@/lib/services/api-key-service';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { CreateApiKeyDialog } from './_components/create-api-key-dialog';
import { ApiKeyRowActions } from './_components/api-key-row-actions';

export const dynamic = 'force-dynamic';

export default async function AdminApiKeysPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [apiKeys, t, tCommon] = await Promise.all([
    listApiKeys(),
    getTranslations('apiKeys'),
    getTranslations('common'),
  ]);

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <CreateApiKeyDialog />
      </div>

      {apiKeys.length === 0 ? (
        <div className="rounded-md border bg-background p-8 text-center text-sm text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('name')}</TableHead>
                <TableHead>{t('scopes')}</TableHead>
                <TableHead>{tCommon('createdAt')}</TableHead>
                <TableHead>{t('lastUsed')}</TableHead>
                <TableHead>{tCommon('status')}</TableHead>
                <TableHead className="w-[60px] text-right">
                  <span className="sr-only">{tCommon('actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((key) => {
                const isRevoked = key.revokedAt !== null;
                return (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {key.scopes.map((scope) => (
                          <Badge
                            key={scope}
                            variant="secondary"
                            className="font-mono text-[0.7rem]"
                          >
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dateFormatter.format(key.createdAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {key.lastUsedAt
                        ? dateFormatter.format(key.lastUsedAt)
                        : tCommon('never')}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={isRevoked ? 'destructive' : 'default'}
                      >
                        {isRevoked ? t('statusRevoked') : t('statusActive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <ApiKeyRowActions
                        apiKeyId={key.id}
                        apiKeyName={key.name}
                        isRevoked={isRevoked}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
