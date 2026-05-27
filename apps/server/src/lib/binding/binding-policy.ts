import { BindingType, type BindingType as BindingTypeT } from '@prisma/client';
import { z } from 'zod';

/**
 * BindingPolicy describes how a license may be bound to clients.
 *
 * - `required`: binding types that MUST be provided by every activate call.
 *   If empty/undefined, the activation has no required bindings.
 * - `maxPerType`: cap on simultaneously-active activations per binding type.
 *   A missing entry = unlimited.
 *
 * Defaults (when the License row has bindingPolicy = `{}`):
 *   no required bindings, unlimited per type.
 */
export const bindingTypeSchema = z.nativeEnum(BindingType);

// Lenient parsing: unknown keys are silently dropped so legacy bindingPolicy
// JSON (from older license issuances) keeps working. Strict validation lives
// in the admin-side write-path schemas, not in the activation read-path.
export const bindingPolicySchema = z
  .object({
    required: z.array(bindingTypeSchema).optional(),
    maxPerType: z.record(bindingTypeSchema, z.number().int().positive()).optional(),
  })
  .default({});

export type BindingPolicy = z.infer<typeof bindingPolicySchema>;

export function parseBindingPolicy(raw: unknown): BindingPolicy {
  if (raw === null || raw === undefined) return {};
  const parsed = bindingPolicySchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid binding policy in DB: ${parsed.error.message}`);
  }
  return parsed.data;
}

export class BindingPolicyViolationError extends Error {
  constructor(
    public readonly reason: 'missing_required' | 'max_exceeded',
    public readonly bindingType: BindingTypeT,
    public readonly detail?: string,
  ) {
    super(`Binding policy violation (${reason}) for type ${bindingType}${detail ? `: ${detail}` : ''}`);
    this.name = 'BindingPolicyViolationError';
  }
}

/**
 * Asserts that every required binding type is present in the provided list.
 * Throws BindingPolicyViolationError on the first missing type.
 */
export function assertRequiredBindingsProvided(
  policy: BindingPolicy,
  providedTypes: BindingTypeT[],
): void {
  const required = policy.required ?? [];
  for (const t of required) {
    if (!providedTypes.includes(t)) {
      throw new BindingPolicyViolationError('missing_required', t);
    }
  }
}

/**
 * Returns the configured maximum number of active activations for the given
 * binding type, or null if unlimited.
 */
export function maxActivationsFor(policy: BindingPolicy, type: BindingTypeT): number | null {
  return policy.maxPerType?.[type] ?? null;
}
