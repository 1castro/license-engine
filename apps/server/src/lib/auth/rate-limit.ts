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
  /** Number of live buckets — for tests / memory observability. */
  size(): number;
}

export function createInMemoryRateLimiter(opts: {
  capacity: number;
  refillTokensPerMinute: number;
  /** Soft cap on distinct keys before an idle-bucket sweep runs. */
  maxKeys?: number;
}): RateLimiter {
  const buckets = new Map<string, Bucket>();
  const refillPerMs = opts.refillTokensPerMinute / 60_000;
  const maxKeys = opts.maxKeys ?? 50_000;
  // Time for an untouched bucket to refill back to full capacity. Once a bucket
  // has been idle this long it is indistinguishable from a never-seen key, so
  // dropping it changes no decision.
  const fullRefillMs = opts.capacity / refillPerMs;

  // Bounds memory against a flood of distinct keys (e.g. spoofed X-Forwarded-For
  // when TRUST_PROXY_HEADERS=true). Two layers:
  let lastSweepMs = 0;
  function maybeEvict(now: number) {
    if (buckets.size < maxKeys) return;
    // (1) Idle sweep, throttled to ≤1×/fullRefillMs: reclaim buckets that have
    // fully refilled (indistinguishable from never-seen, so dropping is free).
    // Throttled because an all-fresh-keys flood frees nothing here, and an O(n)
    // scan on EVERY request would itself be a CPU-amplification vector.
    if (now - lastSweepMs >= fullRefillMs) {
      lastSweepMs = now;
      for (const [key, b] of buckets) {
        if (now - b.lastRefillMs >= fullRefillMs) buckets.delete(key);
      }
    }
    // (2) Hard ceiling: if the idle sweep couldn't bring us under the cap (a
    // flood of fresh keys where nothing is idle yet), drop oldest-inserted
    // entries until back at the cap. Bounds memory ABSOLUTELY at maxKeys. Under
    // such a flood the limiter is bypassed regardless (each fresh key is its own
    // bucket), so evicting buckets only resets some limits — never a safety
    // loss — while preventing unbounded growth / OOM.
    while (buckets.size >= maxKeys) {
      const oldest = buckets.keys().next().value;
      if (oldest === undefined) break;
      buckets.delete(oldest);
    }
  }

  return {
    tryConsume(key: string): boolean {
      const now = Date.now();
      maybeEvict(now);
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
    size(): number {
      return buckets.size;
    },
  };
}

/**
 * Login attempts: 5 per minute per identifier (email).
 * Burst capacity 5, refill 5/min — comfortable for honest typos, painful for brute-force.
 */
export const loginLimiter = createInMemoryRateLimiter({
  capacity: 5,
  refillTokensPerMinute: 5,
});

/**
 * Per-IP gate on portal login, complementing the per-email loginLimiter.
 * Without it a single source could password-spray across many different emails
 * unthrottled (each email keeps its own per-email bucket). 50/min/IP-hash is
 * comfortable even for a larger office behind a shared NAT (start-of-day login
 * bursts) while still capping a spray from one origin to 50 tries/min. Consumed
 * only after the progressive backoff check and only when a real client IP is
 * available (TRUST_PROXY_HEADERS on) — see the login route.
 */
export const loginIpLimiter = createInMemoryRateLimiter({
  capacity: 50,
  refillTokensPerMinute: 50,
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
 * Public-key discovery (.well-known/public-keys). SDKs cache the list and refresh
 * rarely (weekly), so 30/min/IP-hash is ample for honest clients while capping a
 * flood that would otherwise re-run findMany + importSPKI per request (DoS
 * amplification, only partially mitigated by the CDN s-maxage).
 */
export const discoveryLimiter = createInMemoryRateLimiter({
  capacity: 30,
  refillTokensPerMinute: 30,
});

/**
 * Portal forgot-password requests: 3/min PER EMAIL, keyed on the email alone
 * (NOT email+IP). This is the mail-bomb cap: it must hold regardless of source
 * IP, otherwise an attacker rotating IPs defeats it and floods a victim's inbox
 * with reset mails. Trade-off: a single attacker can briefly exhaust a victim's
 * per-email bucket and stall their own reset request — acceptable (the user
 * retries in a minute) versus an inbox full of real reset mails.
 */
export const portalForgotLimiter = createInMemoryRateLimiter({
  capacity: 3,
  refillTokensPerMinute: 3,
});

/**
 * Per-IP gate on forgot-password, complementing the per-email cap above. Caps a
 * single source spraying reset requests across many different email addresses
 * (enumeration / broad mail-bombing). 10/min/IP-hash.
 */
export const portalForgotIpLimiter = createInMemoryRateLimiter({
  capacity: 10,
  refillTokensPerMinute: 10,
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
