import {
  ActivationStatus,
  BindingType,
  LicenseStatus,
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

/** Max bindings accepted in a single activate-request body — prevents abuse. */
export const MAX_BINDINGS_PER_ACTIVATE = 20;

export type IncomingBinding = z.infer<typeof incomingBindingSchema>;

export interface ActivationResult {
  activations: Activation[];
  newlyCreated: number;
}

/** Thrown when applyBindings observes the license has become non-active between
 *  the initial read and the transactional re-check inside the FOR-UPDATE-lock. */
export class LicenseStateChangedError extends Error {
  constructor(
    public readonly newStatus: LicenseStatus | 'expired_by_time' | 'missing',
  ) {
    super(`License state changed before activation: ${newStatus}`);
    this.name = 'LicenseStateChangedError';
  }
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
 *
 * The quota check + insert runs inside a single transaction with a pessimistic
 * row-lock on the License (`SELECT ... FOR UPDATE`). Without the lock, two
 * concurrent activates against the same license could both observe `count < max`
 * and both create a row, exceeding the binding policy's quota. With the lock,
 * the second transaction blocks until the first commits, so its count reflects
 * the new state.
 *
 * Audit-log writes happen outside the transaction — audit-log persistence is
 * best-effort and must never roll back a successful activation.
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

  const { activations, newlyCreatedIds } = await prisma.$transaction(async (tx) => {
    // Pessimistic lock + status re-check on the License row. The route layer
    // already verified the license is active before calling us, but between
    // that read and acquiring the FOR-UPDATE lock the row could have been
    // revoked or expired by an admin or the cron job. We refuse to create new
    // Activation rows in that case — otherwise a token would be signed for a
    // license that is no longer eligible.
    const locked = await tx.$queryRaw<
      Array<{ id: string; status: LicenseStatus; expires_at: Date | null }>
    >`SELECT id, status, "expiresAt" AS expires_at FROM "License" WHERE id = ${license.id} FOR UPDATE`;
    const row = locked[0];
    if (!row) {
      throw new LicenseStateChangedError('missing');
    }
    if (row.status !== LicenseStatus.active) {
      throw new LicenseStateChangedError(row.status);
    }
    if (row.expires_at && row.expires_at.getTime() <= Date.now()) {
      throw new LicenseStateChangedError('expired_by_time');
    }

    const activations: Activation[] = [];
    const newlyCreatedIds: { id: string; bindingType: BindingType }[] = [];

    for (const b of incoming) {
      const hash = hashBindingValue(b.type, b.value);
      const metadata = enrichMetadataWithDisplayName(b);

      const existing = await tx.activation.findUnique({
        where: {
          binding_unique: { licenseId: license.id, bindingType: b.type, bindingValueHash: hash },
        },
      });

      if (existing) {
        const refreshed = await tx.activation.update({
          where: { id: existing.id },
          data: {
            lastSeenAt: new Date(),
            status: ActivationStatus.active,
            releasedAt: null,
            bindingValueMetadata: metadata as Prisma.InputJsonValue,
          },
        });
        activations.push(refreshed);
        continue;
      }

      const max = maxActivationsFor(policy, b.type);
      if (max !== null) {
        const currentActive = await tx.activation.count({
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

      const created = await tx.activation.create({
        data: {
          licenseId: license.id,
          bindingType: b.type,
          bindingValueHash: hash,
          bindingValueMetadata: metadata as Prisma.InputJsonValue,
          status: ActivationStatus.active,
        },
      });
      activations.push(created);
      newlyCreatedIds.push({ id: created.id, bindingType: b.type });
    }

    return { activations, newlyCreatedIds };
  });

  for (const a of newlyCreatedIds) {
    await writeAuditLog({
      eventType: AuditEventType.ActivationCreated,
      actorType: 'anonymous',
      actorId: null,
      targetType: 'Activation',
      targetId: a.id,
      metadata: { licenseId: license.id, bindingType: a.bindingType },
      ip: ipForAudit,
    });
  }

  return { activations, newlyCreated: newlyCreatedIds.length };
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

/**
 * Server-side metadata fallback: if the caller (SDK / direct API user) did
 * not include a displayName, derive one from the binding type + raw value
 * where it's safe to do so (no PII implications).
 *
 *   domain         → the raw domain name (not personal data)
 *   installation   → "Installation <first-8-chars>" (the value is a UUID anyway)
 *   device/account → leave as caller-provided (the raw value may identify a person)
 *
 * The raw binding value is otherwise discarded after hashing — we never store
 * the raw value for any binding type.
 */
function enrichMetadataWithDisplayName(b: IncomingBinding): Record<string, unknown> {
  const metadata = { ...(b.metadata ?? {}) } as Record<string, unknown>;
  if (typeof metadata.displayName === 'string' && metadata.displayName.length > 0) {
    return metadata;
  }
  if (b.type === 'domain') {
    metadata.displayName = b.value;
  } else if (b.type === 'installation') {
    metadata.displayName = `Installation ${b.value.slice(0, 8)}`;
  }
  // device / account: no automatic displayName — caller decides what's safe to show.
  return metadata;
}
