/**
 * Shape returned by `/api/admin/v1/*` routes on non-2xx responses.
 * See `jsonError()` in `lib/auth/admin-route-auth.ts`.
 */
export interface AdminApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function isAdminApiErrorBody(value: unknown): value is AdminApiErrorBody {
  if (!value || typeof value !== 'object') return false;
  const err = (value as { error?: unknown }).error;
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  const message = (err as { message?: unknown }).message;
  return typeof code === 'string' && typeof message === 'string';
}

/**
 * Parses an error response body. Returns null when the body is not a
 * recognizable admin-api error envelope (e.g. plain text 500 from the
 * runtime). The caller falls back to a generic translated string.
 */
export async function parseAdminApiError(
  res: Response,
): Promise<AdminApiErrorBody['error'] | null> {
  try {
    const data: unknown = await res.json();
    if (isAdminApiErrorBody(data)) {
      return data.error;
    }
    return null;
  } catch {
    return null;
  }
}
