'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { parseAdminApiError } from '@/lib/admin-ui/api-error';

const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const productFormSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(slugRegex, 'slug must be lowercase kebab-case'),
  name: z.string().min(1).max(120),
  recheckIntervalHours: z.coerce.number().int().min(1).max(720),
  jwtLifetimeHours: z.coerce.number().int().min(1).max(8760),
  licenseKeyPrefix: z.string().min(1).max(16),
  revocationStrategy: z.enum(['recheck', 'refresh']),
  featureCatalogText: z.string().max(4000),
});

type ProductFormValues = z.infer<typeof productFormSchema>;

export interface ProductFormInitial {
  id: string;
  slug: string;
  name: string;
  recheckIntervalHours: number;
  jwtLifetimeHours: number;
  licenseKeyPrefix: string;
  revocationStrategy: 'recheck' | 'refresh';
  featureCatalog: string[];
}

interface CreateProps {
  mode: 'create';
  initial?: undefined;
}

interface EditProps {
  mode: 'edit';
  initial: ProductFormInitial;
}

export function ProductForm(props: CreateProps | EditProps) {
  const t = useTranslations('products');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues:
      props.mode === 'edit'
        ? {
            slug: props.initial.slug,
            name: props.initial.name,
            recheckIntervalHours: props.initial.recheckIntervalHours,
            jwtLifetimeHours: props.initial.jwtLifetimeHours,
            licenseKeyPrefix: props.initial.licenseKeyPrefix,
            revocationStrategy: props.initial.revocationStrategy,
            featureCatalogText: props.initial.featureCatalog.join('\n'),
          }
        : {
            slug: '',
            name: '',
            recheckIntervalHours: 24,
            jwtLifetimeHours: 168,
            licenseKeyPrefix: 'TROP',
            revocationStrategy: 'recheck',
            featureCatalogText: '',
          },
  });

  async function onSubmit(values: ProductFormValues) {
    setSubmitError(null);
    const featureCatalog = values.featureCatalogText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const payload = {
      slug: values.slug,
      name: values.name,
      recheckIntervalHours: values.recheckIntervalHours,
      jwtLifetimeHours: values.jwtLifetimeHours,
      licenseKeyPrefix: values.licenseKeyPrefix,
      revocationStrategy: values.revocationStrategy,
      featureCatalog,
    };

    const url =
      props.mode === 'edit'
        ? `/api/admin/v1/products/${props.initial.id}`
        : '/api/admin/v1/products';
    const method = props.mode === 'edit' ? 'PATCH' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.push('/admin/products');
        router.refresh();
        return;
      }
      const err = await parseAdminApiError(res);
      setSubmitError(err?.message ?? tCommon('errorGeneric'));
    } catch {
      setSubmitError(tCommon('errorNetwork'));
    }
  }

  const submitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('slug')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="my-product"
                    autoComplete="off"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('name')}</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete="off" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="recheckIntervalHours"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('recheckInterval')}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={720}
                    {...field}
                    value={field.value}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="jwtLifetimeHours"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('jwtLifetime')}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={8760}
                    {...field}
                    value={field.value}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="licenseKeyPrefix"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('prefix')}</FormLabel>
                <FormControl>
                  <Input {...field} maxLength={16} autoComplete="off" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="revocationStrategy"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('revocationStrategy')}</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="recheck">
                      {t('revocationRecheck')}
                    </SelectItem>
                    <SelectItem value="refresh">
                      {t('revocationRefresh')}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="featureCatalogText"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('featureCatalog')}</FormLabel>
              <FormControl>
                <Textarea {...field} rows={6} placeholder="feature-a&#10;feature-b" />
              </FormControl>
              <FormDescription>{t('featureCatalogHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {submitError && (
          <Alert variant="destructive">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push('/admin/products')}
            disabled={submitting}
          >
            {tCommon('cancel')}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? tCommon('saving') : tCommon('save')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
