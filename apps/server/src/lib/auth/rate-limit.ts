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
