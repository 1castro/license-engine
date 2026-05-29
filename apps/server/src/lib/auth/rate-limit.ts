/**
 * Tiny in-memory token bucket for login throttling.
 *
 * Scope is per-process — fine for Phase-1 single-instance deploy.
 * When we run multi-instance, this lifts to a Redis/Upstash-backed
 * implementation that shares state across nodes.
 */
interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export interface RateLimiter {
  /** Returns true if the action is allowed; consumes one token if so. */
  tryConsume(key: string): boolean;
  /** Clears all buckets. Used by tests to keep runs deterministic. */
  reset(): void;
}

export function createInMemoryRateLimiter(opts: {
  capacity: number;
  refillTokensPerMinute: number;
}): RateLimiter {
  const buckets = new Map<string, Bucket>();
  const refillPerMs = opts.refillTokensPerMinute / 60_000;

  return {
    tryConsume(key: string): boolean {
      const now = Date.now();
      const existing = buckets.get(key);
      const bucket: Bucket = existing ?? { tokens: opts.capacity, lastRefillMs: now };

      const elapsed = now - bucket.lastRefillMs;
      bucket.tokens = Math.min(opts.capacity, bucket.tokens + elapsed * refillPerMs);
      bucket.lastRefillMs = now;

      if (bucket.tokens < 1) {
        buckets.set(key, bucket);
        return false;
      }

      bucket.tokens -= 1;
      buckets.set(key, bucket);
      return true;
    },
    reset(): void {
      buckets.clear();
    },
  };
}

/**
 * Login attempts: 5 per minute per identifier (email or IP).
 * Burst capacity 5, refill 5/min — comfortable for honest typos, painful for brute-force.
 */
export const loginLimiter = createInMemoryRateLimiter({
  capacity: 5,
  refillTokensPerMinute: 5,
});

/**
 * Public activate endpoint: 10 per minute per IP-hash.
 * Tight enough to make license-key guessing painful, loose enough to handle
 * a user retrying after a typo.
 */
export const activateLimiter = createInMemoryRateLimiter({
  capacity: 10,
  refillTokensPerMinute: 10,
});

/**
 * Re-check is called by every active client every Re-Check-Interval (default 24h).
 * 60/min/IP handles a small fleet sharing a NAT without burdening honest clients.
 */
export const recheckLimiter = createInMemoryRateLimiter({
  capacity: 60,
  refillTokensPerMinute: 60,
});

/**
 * Portal forgot-password requests: 3/min/email. Tight to prevent reset-mail
 * spamming a victim's inbox.
 */
export const portalForgotLimiter = createInMemoryRateLimiter({
  capacity: 3,
  refillTokensPerMinute: 3,
});

/**
 * Portal password setup/reset redemption: 10/min/IP-hash. The single-use tokens
 * are 256-bit (brute-force is hopeless), but each call triggers an expensive
 * Argon2 hash — the limiter caps that work as defence-in-depth against flooding.
 */
export const portalPasswordLimiter = createInMemoryRateLimiter({
  capacity: 10,
  refillTokensPerMinute: 10,
});
