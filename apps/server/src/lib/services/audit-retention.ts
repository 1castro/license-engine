import { prisma } from '../prisma';
import { AuditEventType } from '../audit';

/**
 * Differentiated audit-log retention.
 *
 * Security-/forensics-relevant events (logins, rejected activations, token
 * verify failures, revocations, key + credential lifecycle) are kept for a long
 * window; routine bookkeeping (CRUD, activation create/release, expiry) is
 * pruned sooner. Both windows are configurable via env. Pruning is invoked by
 * `scripts/prune-audit-log.ts` (cron) — never automatically on the request path.
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
  AuditEventType.ApiKeyCreated,
  AuditEventType.ApiKeyRevoked,
  AuditEventType.SigningKeyCreated,
  AuditEventType.SigningKeyRotated,
  AuditEventType.PortalPasswordSet,
  AuditEventType.PortalPasswordReset,
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
 *  - routine events (everything not in CRITICAL_EVENTS) older than routineDays
 *  - critical events older than criticalDays
 */
export async function pruneAuditLog(input: PruneInput): Promise<PruneResult> {
  const routineCutoff = daysAgo(input.now, input.routineDays);
  const criticalCutoff = daysAgo(input.now, input.criticalDays);

  // Spread to a mutable array — Prisma's in/notIn types reject readonly arrays.
  const critical = [...CRITICAL_EVENTS];
  const [routineRes, criticalRes] = await prisma.$transaction([
    prisma.auditLog.deleteMany({
      where: {
        eventType: { notIn: critical },
        timestamp: { lt: routineCutoff },
      },
    }),
    prisma.auditLog.deleteMany({
      where: {
        eventType: { in: critical },
        timestamp: { lt: criticalCutoff },
      },
    }),
  ]);

  return {
    routineDeleted: routineRes.count,
    criticalDeleted: criticalRes.count,
    routineCutoff,
    criticalCutoff,
  };
}
