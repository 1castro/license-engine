import { ExternalSource, Prisma, type Customer } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { writeAuditLog, AuditEventType } from '../audit';
import { sendSetupMail } from '../portal/auth-service';
import { getLogger } from '../logger';
import type { AdminAuthContext } from '../auth/admin-route-auth';
import { actorOf } from '../auth/admin-route-auth';

// -----------------------------------------------------------------------------
// Validation schemas
// -----------------------------------------------------------------------------

export const customerCreateSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(200),
  company: z.string().min(1).max(200).optional(),
  notes: z.string().max(4000).optional(),
  externalRef: z.string().min(1).max(200).optional(),
  externalSource: z.nativeEnum(ExternalSource).default('manual'),
});

export const customerUpdateSchema = customerCreateSchema.partial();

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

// -----------------------------------------------------------------------------
// Service operations
// -----------------------------------------------------------------------------

export function listCustomers(): Promise<Customer[]> {
  return prisma.customer.findMany({ orderBy: { createdAt: 'desc' } });
}

export function getCustomer(id: string): Promise<Customer | null> {
  return prisma.customer.findUnique({ where: { id } });
}

export async function createCustomer(
  input: CustomerCreateInput,
  ctx: AdminAuthContext,
): Promise<{ customer: Customer; created: boolean }> {
  // Idempotency: when called with a non-manual externalRef/source pair, an
  // existing record short-circuits creation. Webhooks (Stripe, Paddle, …)
  // may retry repeatedly; the second call must return the same customer
  // instead of failing with a UNIQUE violation. Mirrors createLicense.
  if (input.externalRef && input.externalSource !== 'manual') {
    const existing = await prisma.customer.findUnique({
      where: {
        externalRef_unique: {
          externalSource: input.externalSource,
          externalRef: input.externalRef,
        },
      },
    });
    if (existing) {
      return { customer: existing, created: false };
    }
  }

  const customer = await prisma.customer.create({
    data: {
      email: input.email,
      name: input.name,
      company: input.company,
      notes: input.notes,
      externalRef: input.externalRef,
      externalSource: input.externalSource,
    },
  });
  await writeAuditLog({
    eventType: AuditEventType.CustomerCreated,
    ...actorOf(ctx),
    targetType: 'Customer',
    targetId: customer.id,
    metadata: { email: customer.email, name: customer.name },
    ip: ctx.ip,
  });

  // Fire-and-forget portal-setup mail. Failure here must NOT roll back the
  // customer creation — admin can resend the mail later via the UI.
  sendSetupMail(customer).catch((err: unknown) => {
    getLogger().warn(
      {
        event: 'portal.setup_mail_failed',
        customerId: customer.id,
        err: err instanceof Error ? err.message : 'unknown',
      },
      'Failed to send initial portal setup mail',
    );
  });

  return { customer, created: true };
}

export async function updateCustomer(
  id: string,
  input: CustomerUpdateInput,
  ctx: AdminAuthContext,
): Promise<Customer> {
  const data: Prisma.CustomerUpdateInput = {};
  if (input.email !== undefined) data.email = input.email;
  if (input.name !== undefined) data.name = input.name;
  if (input.company !== undefined) data.company = input.company;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.externalRef !== undefined) data.externalRef = input.externalRef;
  if (input.externalSource !== undefined) data.externalSource = input.externalSource;

  const customer = await prisma.customer.update({ where: { id }, data });
  await writeAuditLog({
    eventType: AuditEventType.CustomerUpdated,
    ...actorOf(ctx),
    targetType: 'Customer',
    targetId: customer.id,
    metadata: { fields: Object.keys(data) },
    ip: ctx.ip,
  });
  return customer;
}

export class CustomerHasLicensesError extends Error {
  constructor(public readonly licenseCount: number) {
    super(`Cannot delete customer: ${licenseCount} license(s) still reference it`);
    this.name = 'CustomerHasLicensesError';
  }
}

export async function deleteCustomer(id: string, ctx: AdminAuthContext): Promise<void> {
  // Refuse delete while licenses still reference this customer.
  // Mirrors Prisma's onDelete: Restrict but surfaces a typed error for callers.
  const licenseCount = await prisma.license.count({ where: { customerId: id } });
  if (licenseCount > 0) {
    throw new CustomerHasLicensesError(licenseCount);
  }

  const customer = await prisma.customer.delete({ where: { id } });
  await writeAuditLog({
    eventType: AuditEventType.CustomerDeleted,
    ...actorOf(ctx),
    targetType: 'Customer',
    targetId: id,
    metadata: { email: customer.email, name: customer.name },
    ip: ctx.ip,
  });
}
