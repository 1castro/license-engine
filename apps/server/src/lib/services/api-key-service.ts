import { Prisma, type ApiKey } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { writeAuditLog, AuditEventType } from '../audit';
import { generateApiKey } from '../auth/api-key';
import { ALL_SCOPES, type ApiKeyScope } from '../auth/api-key-middleware';
import type { AdminAuthContext } from '../auth/admin-route-auth';
import { actorOf } from '../auth/admin-route-auth';

// -----------------------------------------------------------------------------
// Validation schemas
// -----------------------------------------------------------------------------

const scopeSchema = z.string().refine(
  (value): value is ApiKeyScope => (ALL_SCOPES as readonly string[]).includes(value),
  (value) => ({ message: `Unknown scope "${value}"` }),
);

export const apiKeyCreateSchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(scopeSchema).min(1),
  /** Optional: restrict the key to a single license (multi-tenant isolation). */
  licenseId: z.string().min(1).optional(),
});

export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;

// -----------------------------------------------------------------------------
// Response DTOs
// -----------------------------------------------------------------------------

export interface ApiKeyDto {
  id: string;
  name: string;
  scopes: ApiKeyScope[];
  licenseId: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

function toDto(row: ApiKey): ApiKeyDto {
  return {
    id: row.id,
    name: row.name,
    scopes: parseScopes(row.scopes),
    licenseId: row.licenseId,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  };
}

function parseScopes(raw: unknown): ApiKeyScope[] {
  if (!Array.isArray(raw)) return [];
  const out: ApiKeyScope[] = [];
  for (const s of raw) {
    if (typeof s === 'string' && (ALL_SCOPES as readonly string[]).includes(s)) {
      out.push(s as ApiKeyScope);
    }
  }
  return out;
}

// -----------------------------------------------------------------------------
// Service operations
// -----------------------------------------------------------------------------

export async function listApiKeys(): Promise<ApiKeyDto[]> {
  const rows = await prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(toDto);
}

export interface CreatedApiKey {
  apiKey: ApiKeyDto;
  /** Plaintext key, returned exactly once on creation. Never stored. */
  plaintext: string;
}

export class ApiKeyLicenseNotFoundError extends Error {
  constructor(public readonly licenseId: string) {
    super(`License not found for api-key binding: ${licenseId}`);
    this.name = 'ApiKeyLicenseNotFoundError';
  }
}

export async function createApiKey(
  input: ApiKeyCreateInput,
  ctx: AdminAuthContext,
): Promise<CreatedApiKey> {
  // Validate the optional license binding up front for a clean 400 instead of
  // letting the FK constraint surface as an unhandled 500.
  if (input.licenseId) {
    const license = await prisma.license.findUnique({
      where: { id: input.licenseId },
      select: { id: true },
    });
    if (!license) {
      throw new ApiKeyLicenseNotFoundError(input.licenseId);
    }
  }

  const generated = generateApiKey();
  const scopes = input.scopes as Prisma.InputJsonValue;
  const row = await prisma.apiKey.create({
    data: {
      name: input.name,
      keyHash: generated.hash,
      scopes,
      licenseId: input.licenseId ?? null,
    },
  });
  await writeAuditLog({
    eventType: AuditEventType.ApiKeyCreated,
    ...actorOf(ctx),
    targetType: 'ApiKey',
    targetId: row.id,
    metadata: { name: row.name, scopes: input.scopes, licenseId: input.licenseId ?? null },
    ip: ctx.ip,
  });
  return { apiKey: toDto(row), plaintext: generated.plaintext };
}

export class ApiKeyAlreadyRevokedError extends Error {
  constructor(public readonly apiKeyId: string) {
    super(`API key already revoked: ${apiKeyId}`);
    this.name = 'ApiKeyAlreadyRevokedError';
  }
}

export class ApiKeyNotFoundError extends Error {
  constructor(public readonly apiKeyId: string) {
    super(`API key not found: ${apiKeyId}`);
    this.name = 'ApiKeyNotFoundError';
  }
}

export async function revokeApiKey(id: string, ctx: AdminAuthContext): Promise<ApiKeyDto> {
  const current = await prisma.apiKey.findUnique({ where: { id } });
  if (!current) {
    throw new ApiKeyNotFoundError(id);
  }
  if (current.revokedAt) {
    throw new ApiKeyAlreadyRevokedError(id);
  }

  const row = await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  await writeAuditLog({
    eventType: AuditEventType.ApiKeyRevoked,
    ...actorOf(ctx),
    targetType: 'ApiKey',
    targetId: row.id,
    metadata: { name: row.name },
    ip: ctx.ip,
  });
  return toDto(row);
}
