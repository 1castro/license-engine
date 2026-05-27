import {
  ActivationStatus,
  BindingType,
  Prisma,
  type Activation,
  type License,
} from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { writeAuditLog, AuditEventType } from '../audit';
import { hashBindingValue } from './binding-hash';
import {
  assertRequiredBindingsProvided,
  BindingPolicyViolationError,
  maxActivationsFor,
  parseBindingPolicy,
} from './binding-policy';

export const incomingBindingSchema = z.object({
  type: z.nativeEnum(BindingType),
  value: z.string().min(1).max(512),
  /** Non-sensitive metadata about the binding (browser name, OS, hostname, etc.). */
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type IncomingBinding = z.infer<typeof incomingBindingSchema>;

export interface ActivationResult {
  activations: Activation[];
  newlyCreated: number;
}

/**
 * Apply an incoming list of bindings against a license.
 *
 * For each provided binding:
 *  - if there is an existing Activation row with the same (license, type, hash):
 *      - reuse it (bump lastSeenAt; resurrect if previously released)
 *  - if not:
 *      - check the per-type quota and insert a new row (status=active)
 *
 * Enforces required-binding-types from the license's BindingPolicy.
 */
export async function applyBindings(
  license: Pick<License, 'id' | 'bindingPolicy'>,
  incoming: IncomingBinding[],
  ipForAudit: string | null,
): Promise<ActivationResult> {
  const policy = parseBindingPolicy(license.bindingPolicy);
  assertRequiredBindingsProvided(
    policy,
    incoming.map((b) => b.type),
  );

  const activations: Activation[] = [];
  let newlyCreated = 0;

  for (const b of incoming) {
    const hash = hashBindingValue(b.type, b.value);

    const existing = await prisma.activation.findUnique({
      where: {
        binding_unique: { licenseId: license.id, bindingType: b.type, bindingValueHash: hash },
      },
    });

    if (existing) {
      const refreshed = await prisma.activation.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          status: ActivationStatus.active,
          releasedAt: null,
          bindingValueMetadata: b.metadata as Prisma.InputJsonValue,
        },
      });
      activations.push(refreshed);
      continue;
    }

    const max = maxActivationsFor(policy, b.type);
    if (max !== null) {
      const currentActive = await prisma.activation.count({
        where: { licenseId: license.id, bindingType: b.type, status: ActivationStatus.active },
      });
      if (currentActive >= max) {
        throw new BindingPolicyViolationError(
          'max_exceeded',
          b.type,
          `already ${currentActive} of ${max} active`,
        );
      }
    }

    const created = await prisma.activation.create({
      data: {
        licenseId: license.id,
        bindingType: b.type,
        bindingValueHash: hash,
        bindingValueMetadata: b.metadata as Prisma.InputJsonValue,
        status: ActivationStatus.active,
      },
    });
    activations.push(created);
    newlyCreated += 1;

    await writeAuditLog({
      eventType: AuditEventType.ActivationCreated,
      actorType: 'anonymous',
      actorId: null,
      targetType: 'Activation',
      targetId: created.id,
      metadata: { licenseId: license.id, bindingType: b.type },
      ip: ipForAudit,
    });
  }

  return { activations, newlyCreated };
}

/**
 * Releases an activation (e.g. user uninstalled the app, freed a device slot).
 * Idempotent — calling on an already-released or non-existent activation
 * returns gracefully without erroring; the client cares only about "freed".
 */
export async function releaseActivation(
  license: Pick<License, 'id'>,
  bindingType: BindingType,
  bindingValue: string,
  ipForAudit: string | null,
): Promise<{ released: boolean }> {
  const hash = hashBindingValue(bindingType, bindingValue);
  const existing = await prisma.activation.findUnique({
    where: { binding_unique: { licenseId: license.id, bindingType, bindingValueHash: hash } },
  });
  if (!existing || existing.status === ActivationStatus.released) {
    return { released: false };
  }

  await prisma.activation.update({
    where: { id: existing.id },
    data: { status: ActivationStatus.released, releasedAt: new Date() },
  });

  await writeAuditLog({
    eventType: AuditEventType.ActivationReleased,
    actorType: 'anonymous',
    actorId: null,
    targetType: 'Activation',
    targetId: existing.id,
    metadata: { licenseId: license.id, bindingType },
    ip: ipForAudit,
  });

  return { released: true };
}
