'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type Control, type FieldValues, type Path } from 'react-hook-form';
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
  externalSource: 'manual' | 'stripe' | 'paddle' | 'polar';
  planName: string | null;
  priceDisplay: string | null;
  billingInterval: string | null;
}

// Display-only billing metadata (mirrored from the PSP / manually maintained).
// Never payment logic — purely so the admin/customer sees what a license costs.
const billingDisplayFields = {
  planName: z.string().max(120).optional().default(''),
  priceDisplay: z.string().max(120).optional().default(''),
  billingInterval: z.string().max(40).optional().default(''),
};

const baseSchema = z.object({
  bindingPolicy: z.record(z.unknown()).default({}),
  featureFlags: z.array(z.string()).default([]),
  expiresAt: z.string().max(40).optional().default(''),
  ...billingDisplayFields,
});

const createSchema = baseSchema.extend({
  customerId: z.string().min(1),
  productId: z.string().min(1),
  type: z.enum(['subscription', 'perpetual']),
  externalRef: z.string().max(200).optional().default(''),
  externalSource: z.enum(['manual', 'stripe', 'paddle', 'polar']),
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

/** Binding types the policy editor exposes, in display order. */
const BINDING_TYPES = ['domain', 'account', 'device', 'installation'] as const;

/** Adds the non-empty display-billing fields to an outgoing license payload. */
function addBillingDisplay(
  payload: Record<string, unknown>,
  values: { planName?: string; priceDisplay?: string; billingInterval?: string },
) {
  if (values.planName?.trim()) payload.planName = values.planName.trim();
  if (values.priceDisplay?.trim()) payload.priceDisplay = values.priceDisplay.trim();
  if (values.billingInterval?.trim()) payload.billingInterval = values.billingInterval.trim();
}

/**
 * Display-only billing fields (plan name, price string, interval). Shared by the
 * create and edit forms. These are NOT payment logic — purely what the admin /
 * customer sees; later typically mirrored from the PSP by the sync module.
 */
function BillingDisplayFields<T extends FieldValues>({ control }: { control: Control<T> }) {
  const fields: Array<{ name: string; label: string; placeholder: string }> = [
    { name: 'planName', label: 'Plan-Name', placeholder: 'z. B. Pro' },
    { name: 'priceDisplay', label: 'Preis (Anzeige)', placeholder: 'z. B. 29 €/Monat' },
    { name: 'billingInterval', label: 'Intervall', placeholder: 'z. B. monthly / yearly / once' },
  ];
  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 p-4">
      <p className="text-sm font-medium">Abrechnung (nur Anzeige)</p>
      <p className="text-xs text-muted-foreground">
        Reine Anzeige-Infos — die Abrechnung selbst läuft beim Zahlungsdienstleister.
        Werden später automatisch von dort gespiegelt.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {fields.map((f) => (
          <FormField
            key={f.name}
            control={control}
            name={f.name as Path<T>}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{f.label}</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="off"
                    placeholder={f.placeholder}
                    {...field}
                    value={(field.value as string | undefined) ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
      </div>
    </div>
  );
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
      bindingPolicy: {},
      externalRef: '',
      externalSource: 'manual',
      planName: '',
      priceDisplay: '',
      billingInterval: '',
    },
  });

  const watchedProductId = form.watch('productId');
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === watchedProductId) ?? null,
    [products, watchedProductId],
  );

  async function onSubmit(values: CreateValues) {
    setSubmitError(null);

    const payload: Record<string, unknown> = {
      customerId: values.customerId,
      productId: values.productId,
      type: values.type,
      featureFlags: values.featureFlags,
      bindingPolicy: values.bindingPolicy,
      externalSource: values.externalSource,
    };
    if (values.expiresAt.trim().length > 0) {
      payload.expiresAt = new Date(values.expiresAt).toISOString();
    }
    if (values.externalRef.trim().length > 0) {
      payload.externalRef = values.externalRef.trim();
    }
    addBillingDisplay(payload, values);

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
                    <SelectItem value="polar">Polar</SelectItem>
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
          name="bindingPolicy"
          render={({ field }) => (
            <BindingPolicyField value={field.value} onChange={field.onChange} />
          )}
        />

        <BillingDisplayFields control={form.control} />

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
      bindingPolicy: initial.bindingPolicy,
      featureFlags: initial.featureFlags,
      expiresAt: initial.expiresAt
        ? toLocalDatetimeInput(new Date(initial.expiresAt))
        : '',
      planName: initial.planName ?? '',
      priceDisplay: initial.priceDisplay ?? '',
      billingInterval: initial.billingInterval ?? '',
    },
  });

  async function onSubmit(values: EditValues) {
    setSubmitError(null);

    const payload: Record<string, unknown> = {
      featureFlags: values.featureFlags,
      bindingPolicy: values.bindingPolicy,
    };
    payload.expiresAt =
      values.expiresAt.trim().length > 0
        ? new Date(values.expiresAt).toISOString()
        : null;
    // Display-billing fields: send trimmed value, or null to clear.
    payload.planName = values.planName?.trim() ? values.planName.trim() : null;
    payload.priceDisplay = values.priceDisplay?.trim() ? values.priceDisplay.trim() : null;
    payload.billingInterval = values.billingInterval?.trim()
      ? values.billingInterval.trim()
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
          name="bindingPolicy"
          render={({ field }) => (
            <BindingPolicyField value={field.value} onChange={field.onChange} />
          )}
        />

        <BillingDisplayFields control={form.control} />

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

/**
 * Binding-policy editor. Replaces the raw-JSON textarea with a per-type row:
 * "required" checkbox + "max seats" number field (empty = unlimited). Emits the
 * policy shape the engine enforces: `{ required?: string[], maxPerType?: {…} }`.
 * Shared (value/onChange) so both create- and edit-form can drive it.
 */
function BindingPolicyField(props: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const t = useTranslations('licenses');
  const typeLabels: Record<string, string> = {
    domain: t('bindingTypeDomain'),
    account: t('bindingTypeAccount'),
    device: t('bindingTypeDevice'),
    installation: t('bindingTypeInstallation'),
  };

  const required = Array.isArray(props.value.required)
    ? (props.value.required as string[])
    : [];
  const maxPerType =
    props.value.maxPerType && typeof props.value.maxPerType === 'object'
      ? (props.value.maxPerType as Record<string, number>)
      : {};

  function emit(nextRequired: string[], nextMax: Record<string, number>) {
    const policy: Record<string, unknown> = {};
    if (nextRequired.length > 0) policy.required = nextRequired;
    if (Object.keys(nextMax).length > 0) policy.maxPerType = nextMax;
    props.onChange(policy);
  }

  function toggleRequired(type: string, checked: boolean) {
    emit(checked ? [...required, type] : required.filter((r) => r !== type), maxPerType);
  }

  function setMax(type: string, raw: string) {
    const next = { ...maxPerType };
    const n = Number.parseInt(raw, 10);
    if (raw.trim() === '' || Number.isNaN(n) || n <= 0) {
      delete next[type];
    } else {
      next[type] = n;
    }
    emit(required, next);
  }

  return (
    <div className="space-y-2">
      <Label>{t('bindingPolicy')}</Label>
      <p className="text-sm text-muted-foreground">{t('bindingPolicyHint')}</p>
      <div className="overflow-hidden rounded-md border border-input">
        <div className="grid grid-cols-[1fr_7rem_9rem] items-center gap-2 border-b border-input bg-muted px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>{t('bindingType')}</span>
          <span className="text-center">{t('bindingRequired')}</span>
          <span>{t('maxSeats')}</span>
        </div>
        {BINDING_TYPES.map((type) => (
          <div
            key={type}
            className="grid grid-cols-[1fr_7rem_9rem] items-center gap-2 px-3 py-2 text-sm"
          >
            <span>{typeLabels[type]}</span>
            <div className="flex justify-center">
              <Checkbox
                checked={required.includes(type)}
                onCheckedChange={(c) => toggleRequired(type, c === true)}
                aria-label={`${typeLabels[type]} ${t('bindingRequired')}`}
              />
            </div>
            <Input
              type="number"
              min={1}
              placeholder={t('unlimited')}
              value={maxPerType[type] ?? ''}
              onChange={(e) => setMax(type, e.target.value)}
              aria-label={`${typeLabels[type]} ${t('maxSeats')}`}
            />
          </div>
        ))}
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
