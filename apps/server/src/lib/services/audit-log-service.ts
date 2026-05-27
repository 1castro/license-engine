import { AuditActorType, type AuditLog, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';

/**
 * Read-only query service for the AuditLog table. Writes happen via
 * `lib/audit/audit-log.ts:writeAuditLog`, not here.
 */

export const auditLogQuerySchema = z.object({
  eventType: z.string().min(1).max(64).optional(),
  actorType: z.nativeEnum(AuditActorType).optional(),
  actorId: z.string().min(1).max(64).optional(),
  targetType: z.string().min(1).max(64).optional(),
  targetId: z.string().min(1).max(64).optional(),
  /** Inclusive lower bound on timestamp, ISO string. */
  from: z
    .string()
    .datetime()
    .optional(),
  /** Exclusive upper bound on timestamp, ISO string. */
  until: z
    .string()
    .datetime()
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  /** Offset-based pagination (Tag-1 simple; can become cursor-based later). */
  offset: z.coerce.number().int().min(0).default(0),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export interface AuditLogPage {
  entries: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

export async function listAuditLogs(query: AuditLogQuery): Promise<AuditLogPage> {
  const where: Prisma.AuditLogWhereInput = {};
  if (query.eventType) where.eventType = query.eventType;
  if (query.actorType) where.actorType = query.actorType;
  if (query.actorId) where.actorId = query.actorId;
  if (query.targetType) where.targetType = query.targetType;
  if (query.targetId) where.targetId = query.targetId;
  if (query.from || query.until) {
    where.timestamp = {};
    if (query.from) where.timestamp.gte = new Date(query.from);
    if (query.until) where.timestamp.lt = new Date(query.until);
  }

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip: query.offset,
      take: query.limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { entries, total, limit: query.limit, offset: query.offset };
}

/** Returns the timestamp of the most recent AuditLog entry, or null if empty. */
export async function getLatestAuditLogTimestamp(): Promise<Date | null> {
  const row = await prisma.auditLog.findFirst({
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true },
  });
  return row?.timestamp ?? null;
}
