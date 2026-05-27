'use client';

import { useMemo, useState } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { parseAdminApiError } from '@/lib/admin-ui/api-error';

export interface LicenseFormCustomer {
  id: string;
  email: string;
  name: string;
}

export interface LicenseFormProduct {
  id: string;
  name: string;
  featureCatalog: string[];
}

export interface LicenseFormInitial {
  id: string;
  customerId: string;
  productId: string;
  licenseKey: string;
  type: 'subscription' | 'perpetual';
  expiresAt: string | null;
  featureFlags: string[];
  bindingPolicy: Record<string, unknown>;
  externalRef: string | null;
  externalSource: 'manual' | 'stripe' | 'paddle';
}

const baseSchema = z.object({
  bindingPolicyText: z.string().max(8000),
  featureFlags: z.array(z.string()).default([]),
  expiresAt: z.string().max(40).optional().default(''),
});

const createSchema = baseSchema.extend({
  customerId: z.string().min(1),
  productId: z.string().min(1),
  type: z.enum(['subscription', 'perpetual']),
  externalRef: z.string().max(200).optional().default(''),
  externalSource: z.enum(['manual', 'stripe', 'paddle']),
});

type CreateValues = z.infer<typeof createSchema>;
type EditValues = z.infer<typeof baseSchema>;

interface CommonProps {
  customers: LicenseFormCustomer[];
  products: LicenseFormProduct[];
}

interface CreateProps extends CommonProps {
  mode: 'create';
  initial?: undefined;
}

interface EditProps extends CommonProps {
  mode: 'edit';
  initial: LicenseFormInitial;
}

export function LicenseForm(props: CreateProps | EditProps) {
  return props.mode === 'create' ? (
    <CreateLicenseForm
      customers={props.customers}
      products={props.products}
    />
  ) : (
    <EditLicenseForm
      customers={props.customers}
      products={props.products}
      initial={props.initial}
    />
  );
}

function bindingPolicyToText(policy: Record<string, unknown>): string {
  if (Object.keys(policy).length === 0) return '{}';
  return JSON.stringify(policy, null, 2);
}

function tryParseJson(value: string): { ok: true; value: Record<string, unknown> } | { ok: false } {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: {} };
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
    ) {
      return { ok: true, value: parsed as Record<string, unknown> };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

function CreateLicenseForm({
  customers,
  products,
}: {
  customers: LicenseFormCustomer[];
  products: LicenseFormProduct[];
}) {
  const t = useTranslations('licenses');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      customerId: '',
      productId: '',
      type: 'subscription',
      expiresAt: '',
      featureFlags: [],
      bindingPolicyText: '{}',
      externalRef: '',
      externalSource: 'manual',
    },
  });

  const watchedProductId = form.watch('productId');
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === watchedProductId) ?? null,
    [products, watchedProductId],
  );

  async function onSubmit(values: CreateValues) {
    setSubmitError(null);

    const parsedPolicy = tryParseJson(values.bindingPolicyText);
    if (!parsedPolicy.ok) {
      form.setError('bindingPolicyText', { message: t('invalidJson') });
      return;
    }

    const payload: Record<string, unknown> = {
      customerId: values.customerId,
      productId: values.productId,
      type: values.type,
      featureFlags: values.featureFlags,
      bindingPolicy: parsedPolicy.value,
      externalSource: values.externalSource,
    };
    if (values.expiresAt.trim().length > 0) {
      payload.expiresAt = new Date(values.expiresAt).toISOString();
    }
    if (values.externalRef.trim().length > 0) {
      payload.externalRef = values.externalRef.trim();
    }

    try {
      const res = await fetch('/api/admin/v1/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.push('/admin/licenses');
        router.refresh();
        return;
      }
      const err = await parseAdminApiError(res);
      if (err?.code === 'product_not_found') {
        setSubmitError(t('errorProductNotFound'));
      } else {
        setSubmitError(err?.message ?? tCommon('errorGeneric'));
      }
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
            name="customerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('customer')}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectCustomer')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name} — {customer.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="productId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('product')}</FormLabel>
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                    // Reset featureFlags when product changes so we don't
                    // carry stale flags from a different product's catalog.
                    form.setValue('featureFlags', []);
                  }}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectProduct')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('type')}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="subscription">
                      {t('typeSubscription')}
                    </SelectItem>
                    <SelectItem value="perpetual">
                      {t('typePerpetual')}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="expiresAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('expiresAt')}{' '}
                  <span className="font-normal text-muted-foreground">
                    ({tCommon('optional')})
                  </span>
                </FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
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
                    <SelectItem value="manual">Manuell</SelectItem>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="paddle">Paddle</SelectItem>
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
          name="featureFlags"
          render={({ field }) => (
            <FeatureFlagsField
              value={field.value}
              onChange={field.onChange}
              product={selectedProduct}
            />
          )}
        />

        <FormField
          control={form.control}
          name="bindingPolicyText"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('bindingPolicy')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={8}
                  className="font-mono text-xs"
                />
              </FormControl>
              <FormDescription>{t('bindingPolicyHint')}</FormDescription>
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
            onClick={() => router.push('/admin/licenses')}
            disabled={submitting}
          >
            {tCommon('cancel')}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? tCommon('creating') : tCommon('create')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function EditLicenseForm({
  customers,
  products,
  initial,
}: {
  customers: LicenseFormCustomer[];
  products: LicenseFormProduct[];
  initial: LicenseFormInitial;
}) {
  const t = useTranslations('licenses');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const product = products.find((p) => p.id === initial.productId) ?? null;
  const customer = customers.find((c) => c.id === initial.customerId);

  const form = useForm<EditValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: {
      bindingPolicyText: bindingPolicyToText(initial.bindingPolicy),
      featureFlags: initial.featureFlags,
      expiresAt: initial.expiresAt
        ? toLocalDatetimeInput(new Date(initial.expiresAt))
        : '',
    },
  });

  async function onSubmit(values: EditValues) {
    setSubmitError(null);

    const parsedPolicy = tryParseJson(values.bindingPolicyText);
    if (!parsedPolicy.ok) {
      form.setError('bindingPolicyText', { message: t('invalidJson') });
      return;
    }

    const payload: Record<string, unknown> = {
      featureFlags: values.featureFlags,
      bindingPolicy: parsedPolicy.value,
    };
    payload.expiresAt =
      values.expiresAt.trim().length > 0
        ? new Date(values.expiresAt).toISOString()
        : null;

    try {
      const res = await fetch(`/api/admin/v1/licenses/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.push('/admin/licenses');
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
          <ReadOnlyField label={t('licenseKey')} value={initial.licenseKey} mono />
          <ReadOnlyField
            label={t('customer')}
            value={
              customer
                ? `${customer.name} — ${customer.email}`
                : initial.customerId
            }
          />
          <ReadOnlyField
            label={t('product')}
            value={product?.name ?? initial.productId}
          />
          <ReadOnlyField
            label={t('type')}
            value={
              initial.type === 'subscription'
                ? t('typeSubscription')
                : t('typePerpetual')
            }
          />
        </div>

        <FormField
          control={form.control}
          name="expiresAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t('expiresAt')}{' '}
                <span className="font-normal text-muted-foreground">
                  ({tCommon('optional')})
                </span>
              </FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="featureFlags"
          render={({ field }) => (
            <FeatureFlagsField
              value={field.value}
              onChange={field.onChange}
              product={product}
            />
          )}
        />

        <FormField
          control={form.control}
          name="bindingPolicyText"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('bindingPolicy')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={8}
                  className="font-mono text-xs"
                />
              </FormControl>
              <FormDescription>{t('bindingPolicyHint')}</FormDescription>
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
            onClick={() => router.push('/admin/licenses')}
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

function ReadOnlyField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div
        className={
          'flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground' +
          (mono ? ' font-mono text-xs' : '')
        }
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Controlled feature-flags picker. Sits outside the react-hook-form FormField
 * machinery so both the create- and edit-form (which have different
 * useForm<…>() generics) can drive it through the same value/onChange contract.
 */
function FeatureFlagsField(props: {
  value: string[];
  onChange: (next: string[]) => void;
  product: LicenseFormProduct | null;
}) {
  const t = useTranslations('licenses');

  return (
    <div className="space-y-2">
      <Label>{t('featureFlags')}</Label>
      <div className="space-y-2">
        {!props.product ? (
          <p className="text-sm text-muted-foreground">{t('selectProduct')}</p>
        ) : props.product.featureCatalog.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('noFeaturesForProduct')}
          </p>
        ) : (
          props.product.featureCatalog.map((feature) => {
            const checked = props.value.includes(feature);
            return (
              <label
                key={feature}
                className="flex items-center gap-2 text-sm"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) => {
                    if (next === true) {
                      props.onChange([...props.value, feature]);
                    } else {
                      props.onChange(props.value.filter((f) => f !== feature));
                    }
                  }}
                />
                <span className="font-mono text-xs">{feature}</span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

function toLocalDatetimeInput(date: Date): string {
  // <input type="datetime-local"> wants 'YYYY-MM-DDTHH:mm' in local time.
  const offsetMs = date.getTimezoneOffset() * 60_000;
  const localISO = new Date(date.getTime() - offsetMs)
    .toISOString()
    .slice(0, 16);
  return localISO;
}
