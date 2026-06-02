import { createHash, createHmac } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { getEnv } from '../env';
import { getLogger } from '../logger';
import { type AuditEventType } from './event-types';

export type AuditActorType = 'admin' | 'api_key' | 'customer' | 'system' | 'anonymous';

export interface AuditLogInput {
  eventType: AuditEventType;
  actorType: AuditActorType;
  actorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  /** Raw IP address (will be hashed before storage). */
  ip?: string | null;
}

const IP_SALT_CONTEXT = 'license-engine:audit-ip:v1';

let cachedIpSalt: Buffer | undefined;

function getIpSalt(): Buffer {
  if (!cachedIpSalt) {
    const env = getEnv();
    // HKDF-Extract-like derivation: HMAC(secret, context) gives us a stable per-deploy
    // salt that's unique to this app instance without introducing a new env var.
    cachedIpSalt = createHmac('sha256', env.NEXTAUTH_SECRET).update(IP_SALT_CONTEXT).digest();
  }
  return cachedIpSalt;
}

/** Hashes an IP into a 32-char hex digest. Returns null for null/undefined input. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (trimmed.length === 0) return null;
  return createHmac('sha256', getIpSalt()).update(trimmed).digest('hex').slice(0, 32);
}

/**
 * Best-effort extraction of the client IP from a Next.js request.
 *
 * Trusts proxy headers ONLY if `TRUST_PROXY_HEADERS=true`. In production the app
 * container has no public port-mapping — the only way to reach it is through the
 * reverse proxy (NGINX Proxy Manager), so the proxy is the sole source of these
 * headers.
 *
 * Source priority (anti-spoofing):
 *  1. `X-Real-IP` — NPM sets it to the real connecting peer (`$remote_addr`) and
 *     OVERWRITES any client-supplied value → trustworthy, not spoofable.
 *  2. `X-Forwarded-For` LAST entry — NPM APPENDS the real peer
 *     (`$proxy_add_x_forwarded_for`), so the FIRST entry is attacker-controlled
 *     and must NOT be used; the last entry is the hop the trusted proxy added.
 *     (With an overwriting proxy first==last, so this stays correct.)
 *
 * Default `TRUST_PROXY_HEADERS=false` → returns null instead of trusting
 * attacker-supplied headers. Rate-limit buckets and audit-log IP hashes then
 * collapse to a single "no-ip" key (safe but coarse). Production deploys MUST
 * set `TRUST_PROXY_HEADERS=true`.
 */
export function extractIp(req: { headers: Headers } | Request): string | null {
  if (!getEnv().TRUST_PROXY_HEADERS) return null;
  const xri = req.headers.get('x-real-ip');
  if (xri) {
    const v = xri.trim();
    if (v) return v;
  }
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return null;
}

/**
 * Sanitizes metadata before persistence: removes obviously sensitive keys
 * (anything containing `password`, `secret`, `token`, `key`) recursively.
 *
 * Defense in depth — callers are also expected not to pass secrets, but
 * stripping at write-time means a careless caller can't accidentally leak.
 */
const SENSITIVE_KEY_RE = /password|secret|token|api[_-]?key|private/i;

function scrubMetadata(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth-limit]';
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((v) => scrubMetadata(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = '[redacted]';
    } else {
      out[k] = scrubMetadata(v, depth + 1);
    }
  }
  return out;
}

/**
 * Writes a single audit log entry.
 *
 * Failures are logged but do NOT throw — auditing must not break business
 * operations. If the DB is down, the operational `pino` log still has the
 * event (we log every audit attempt at info level).
 */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  const log = getLogger();
  const scrubbedMetadata = scrubMetadata(input.metadata ?? {}) as Prisma.InputJsonValue;
  const ipHash = hashIp(input.ip);

  log.info(
    {
      event: input.eventType,
      actorType: input.actorType,
      actorId: input.actorId ?? undefined,
      targetType: input.targetType ?? undefined,
      targetId: input.targetId ?? undefined,
    },
    'audit',
  );

  try {
    await prisma.auditLog.create({
      data: {
        eventType: input.eventType,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: scrubbedMetadata,
        ipHash,
      },
    });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : 'unknown', event: input.eventType },
      'Failed to persist audit log entry',
    );
  }
}

/** Internal export for tests. */
export const __internal = { scrubMetadata, getIpSalt };

// Plain SHA-256 export for non-IP use cases (e.g. binding-value hashing).
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
