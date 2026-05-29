import { LicenseStatus, type AuditLog } from '@prisma/client';
import { prisma } from '../prisma';
import { getSeatUsage } from '../binding/activation-service';
import { parseBindingPolicy } from '../binding/binding-policy';
import { AuditEventType } from '../audit';
import type { SeatInfo } from '@license-engine/shared-types';

/**
 * Read-only aggregations for the admin dashboard + per-license rejection views.
 * The rejection feed is built from `activation.rejected` audit events written by
 * the public activate endpoint.
 */

const REJECTED = AuditEventType.ActivationRejected;
const REJECT_WINDOW_DAYS = 7;

export interface AttemptedBinding {
  type: string;
  value: string;
  displayName?: string;
}

export interface RejectedEntry {
  id: string;
  timestamp: string;
  reason: string;
  bindingType: string | null;
  licenseId: string | null;
  licenseKey: string | null;
  customerName: string | null;
  productName: string | null;
  attemptedBindings: AttemptedBinding[];
  ipHash: string | null;
}

export interface ActiveLicenseOverview {
  id: string;
  licenseKey: string;
  customerName: string;
  productName: string;
  seats: SeatInfo[];
  /** Rejected attempts for this license within the rolling window. */
  rejectedCount: number;
}

function windowStart(): Date {
  return new Date(Date.now() - REJECT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

function readMeta(row: AuditLog): {
  reason: string;
  bindingType: string | null;
  attemptedBindings: AttemptedBinding[];
} {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const reason = typeof meta.reason === 'string' ? meta.reason : 'unbekannt';
  const bindingType = typeof meta.bindingType === 'string' ? meta.bindingType : null;
  const attempted = Array.isArray(meta.attemptedBindings)
    ? (meta.attemptedBindings as unknown[]).flatMap((b) => {
        if (!b || typeof b !== 'object') return [];
        const o = b as Record<string, unknown>;
        if (typeof o.type !== 'string' || typeof o.value !== 'string') return [];
        return [
          {
            type: o.type,
            value: o.value,
            displayName: typeof o.displayName === 'string' ? o.displayName : undefined,
          },
        ];
      })
    : [];
  return { reason, bindingType, attemptedBindings: attempted };
}

/** Enriches raw reject audit rows with license + customer names. */
async function enrich(rows: AuditLog[]): Promise<RejectedEntry[]> {
  const licenseIds = [...new Set(rows.map((r) => r.targetId).filter((x): x is string => !!x))];
  const licenses = licenseIds.length
    ? await prisma.license.findMany({
        where: { id: { in: licenseIds } },
        select: {
          id: true,
          licenseKey: true,
          customer: { select: { name: true } },
          product: { select: { name: true } },
        },
      })
    : [];
  const byId = new Map(licenses.map((l) => [l.id, l]));
  return rows.map((r) => {
    const m = readMeta(r);
    const lic = r.targetId ? byId.get(r.targetId) : undefined;
    return {
      id: r.id,
      timestamp: r.timestamp.toISOString(),
      reason: m.reason,
      bindingType: m.bindingType,
      licenseId: r.targetId,
      licenseKey: lic?.licenseKey ?? null,
      customerName: lic?.customer.name ?? null,
      productName: lic?.product.name ?? null,
      attemptedBindings: m.attemptedBindings,
      ipHash: r.ipHash,
    };
  });
}

/** Count of rejected attempts strictly after `since` (null → all time). */
export function countRejectedSince(since: Date | null): Promise<number> {
  return prisma.auditLog.count({
    where: { eventType: REJECTED, ...(since ? { timestamp: { gt: since } } : {}) },
  });
}

/** Timestamp of the most recent rejected attempt, or null if there are none. */
export async function latestRejectedAt(): Promise<Date | null> {
  const row = await prisma.auditLog.findFirst({
    where: { eventType: REJECTED },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true },
  });
  return row?.timestamp ?? null;
}

/** Most recent rejected attempts across all licenses (for the dashboard feed). */
export async function getRecentRejected(limit = 50): Promise<RejectedEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: { eventType: REJECTED },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
  return enrich(rows);
}

/** Rejected attempts for a single license (admin per-license view). */
export async function getRejectedForLicense(licenseId: string, limit = 50): Promise<RejectedEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: { eventType: REJECTED, targetId: licenseId },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
  return enrich(rows);
}

/** Count of rejected attempts for a single license (portal + dashboard column). */
export function countRejectedForLicense(licenseId: string): Promise<number> {
  return prisma.auditLog.count({ where: { eventType: REJECTED, targetId: licenseId } });
}

/** Active licenses with seat usage + recent rejection count for the dashboard. */
export async function getActiveLicensesOverview(): Promise<ActiveLicenseOverview[]> {
  const licenses = await prisma.license.findMany({
    where: { status: LicenseStatus.active },
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { name: true } },
      product: { select: { name: true } },
    },
  });
  const since = windowStart();
  return Promise.all(
    licenses.map(async (l) => ({
      id: l.id,
      licenseKey: l.licenseKey,
      customerName: l.customer.name,
      productName: l.product.name,
      seats: await getSeatUsage(l.id, parseBindingPolicy(l.bindingPolicy)),
      rejectedCount: await prisma.auditLog.count({
        where: { eventType: REJECTED, targetId: l.id, timestamp: { gte: since } },
      }),
    })),
  );
}

/** Headline counts for the dashboard metric tiles. */
export async function getDashboardCounts(): Promise<{
  activeLicenses: number;
  customers: number;
  products: number;
  rejectedWindow: number;
}> {
  const [activeLicenses, customers, products, rejectedWindow] = await Promise.all([
    prisma.license.count({ where: { status: LicenseStatus.active } }),
    prisma.customer.count(),
    prisma.product.count(),
    prisma.auditLog.count({ where: { eventType: REJECTED, timestamp: { gte: windowStart() } } }),
  ]);
  return { activeLicenses, customers, products, rejectedWindow };
}
