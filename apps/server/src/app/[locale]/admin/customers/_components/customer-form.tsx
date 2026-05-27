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

const customerFormSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(200),
  company: z.string().max(200).optional().default(''),
  notes: z.string().max(4000).optional().default(''),
  externalRef: z.string().max(200).optional().default(''),
  externalSource: z.enum(['manual', 'stripe', 'paddle']),
});

type CustomerFormValues = z.infer<typeof customerFormSchema>;

export interface CustomerFormInitial {
  id: string;
  email: string;
  name: string;
  company: string | null;
  notes: string | null;
  externalRef: string | null;
  externalSource: 'manual' | 'stripe' | 'paddle';
}

interface CreateProps {
  mode: 'create';
  initial?: undefined;
}

interface EditProps {
  mode: 'edit';
  initial: CustomerFormInitial;
}

export function CustomerForm(props: CreateProps | EditProps) {
  const t = useTranslations('customers');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues:
      props.mode === 'edit'
        ? {
            email: props.initial.email,
            name: props.initial.name,
            company: props.initial.company ?? '',
            notes: props.initial.notes ?? '',
            externalRef: props.initial.externalRef ?? '',
            externalSource: props.initial.externalSource,
          }
        : {
            email: '',
            name: '',
            company: '',
            notes: '',
            externalRef: '',
            externalSource: 'manual',
          },
  });

  async function onSubmit(values: CustomerFormValues) {
    setSubmitError(null);
    const payload: Record<string, unknown> = {
      email: values.email,
      name: values.name,
      externalSource: values.externalSource,
    };
    if (values.company.trim().length > 0) payload.company = values.company.trim();
    if (values.notes.trim().length > 0) payload.notes = values.notes.trim();
    if (values.externalRef.trim().length > 0)
      payload.externalRef = values.externalRef.trim();

    const url =
      props.mode === 'edit'
        ? `/api/admin/v1/customers/${props.initial.id}`
        : '/api/admin/v1/customers';
    const method = props.mode === 'edit' ? 'PATCH' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.push('/admin/customers');
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
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('email')}</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="off" {...field} />
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
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="company"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('company')}{' '}
                  <span className="font-normal text-muted-foreground">
                    ({tCommon('optional')})
                  </span>
                </FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="externalSource"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('externalSource')}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="manual">{t('sourceManual')}</SelectItem>
                    <SelectItem value="stripe">{t('sourceStripe')}</SelectItem>
                    <SelectItem value="paddle">{t('sourcePaddle')}</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="externalRef"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('externalRef')}{' '}
                  <span className="font-normal text-muted-foreground">
                    ({tCommon('optional')})
                  </span>
                </FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t('notes')}{' '}
                <span className="font-normal text-muted-foreground">
                  ({tCommon('optional')})
                </span>
              </FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
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
            onClick={() => router.push('/admin/customers')}
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
