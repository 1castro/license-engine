import { prisma } from '../prisma';
import { AuditEventType } from '../audit';

/**
 * Differentiated audit-log retention.
 *
 * Security-/forensics-relevant events (logins, rejected activations, token
 * verify failures, revocations + expiry, key + credential lifecycle) are kept
 * for a long window; routine bookkeeping (CRUD, activation create/release) is
 * pruned sooner. Both windows are configurable via env. Pruning is invoked by
 * `scripts/prune-audit-log.ts` (cron) — never automatically on the request path.
 *
 * Design: BOTH classes are explicit allowlists. Anything that is in neither
 * list (legacy rows, manually inserted data, a future event type someone forgot
 * to classify) is NEVER deleted — failing safe toward keeping data rather than
 * silently dropping unknown audit trails.
 */

/** Events kept for the long (critical) retention window. */
export const CRITICAL_EVENTS: readonly string[] = [
  AuditEventType.AdminLoginSuccess,
  AuditEventType.AdminLoginFailure,
  AuditEventType.AdminLoginRateLimited,
  AuditEventType.PortalLoginSuccess,
  AuditEventType.PortalLoginFailure,
  AuditEventType.ActivationRejected,
  AuditEventType.TokenVerifyFailed,
  AuditEventType.LicenseRevoked,
  // Expiry, like revocation, is part of the license lifecycle and worth keeping
  // as long as a revocation (audit trail of when access ended).
  AuditEventType.LicenseExpired,
  AuditEventType.ApiKeyCreated,
  AuditEventType.ApiKeyRevoked,
  AuditEventType.SigningKeyCreated,
  AuditEventType.SigningKeyRotated,
  AuditEventType.PortalPasswordSet,
  AuditEventType.PortalPasswordReset,
];

/** Routine bookkeeping events, pruned sooner. Explicit (not "everything else"). */
export const ROUTINE_EVENTS: readonly string[] = [
  AuditEventType.ProductCreated,
  AuditEventType.ProductUpdated,
  AuditEventType.ProductDeleted,
  AuditEventType.CustomerCreated,
  AuditEventType.CustomerUpdated,
  AuditEventType.CustomerDeleted,
  AuditEventType.LicenseCreated,
  AuditEventType.LicenseUpdated,
  AuditEventType.ActivationCreated,
  AuditEventType.ActivationReleased,
  AuditEventType.PortalSetupMailResent,
];

export interface PruneInput {
  /** "Now" — injectable for deterministic tests. */
  now: Date;
  routineDays: number;
  criticalDays: number;
}

export interface PruneResult {
  routineDeleted: number;
  criticalDeleted: number;
  routineCutoff: Date;
  criticalCutoff: Date;
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Deletes audit rows older than their per-class retention window:
 *  - routine events older than routineDays
 *  - critical events older than criticalDays
 * Events in neither allowlist are left untouched (fail-safe).
 *
 * Hard invariant: criticalDays >= routineDays. A swapped configuration would
 * otherwise delete the security-relevant trail SOONER than routine noise — the
 * exact inverse of the goal — so we refuse to run instead of silently doing harm.
 */
export async function pruneAuditLog(input: PruneInput): Promise<PruneResult> {
  if (input.criticalDays < input.routineDays) {
    throw new Error(
      `Invalid retention config: criticalDays (${input.criticalDays}) must be >= routineDays (${input.routineDays}).`,
    );
  }
  const routineCutoff = daysAgo(input.now, input.routineDays);
  const criticalCutoff = daysAgo(input.now, input.criticalDays);

  // Spread to mutable arrays — Prisma's `in` type rejects readonly arrays.
  const routine = [...ROUTINE_EVENTS];
  const critical = [...CRITICAL_EVENTS];
  const [routineRes, criticalRes] = await prisma.$transaction([
    prisma.auditLog.deleteMany({
      where: { eventType: { in: routine }, timestamp: { lt: routineCutoff } },
    }),
    prisma.auditLog.deleteMany({
      where: { eventType: { in: critical }, timestamp: { lt: criticalCutoff } },
    }),
  ]);

  return {
    routineDeleted: routineRes.count,
    criticalDeleted: criticalRes.count,
    routineCutoff,
    criticalCutoff,
  };
}
