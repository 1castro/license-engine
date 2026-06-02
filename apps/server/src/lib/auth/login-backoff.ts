/**
 * Progressive login-failure backoff.
 *
 * On top of the existing token-bucket rate-limit (5/min), we track consecutive
 * failures per identifier. Each failure beyond the first introduces an
 * increasing delay before the next attempt is even considered:
 *
 *   failures   wait
 *   1          0s      (first wrong try is free)
 *   2          5s
 *   3          15s
 *   4          45s
 *   5          120s
 *   6+         300s    (capped)
 *
 * A successful login (registered via `recordSuccess`) resets the counter.
 *
 * Like the rate-limiter, this state lives per-process — fine for single-
 * instance deploy, lifts to Redis when we go multi-instance (see docs/PROJEKT.md
 * Roadmap).
 */

interface BackoffState {
  consecutiveFailures: number;
  nextAttemptAt: number; // epoch ms
}

// Index = number of consecutive failures. Index 0 is unused (no failure yet),
// index 1 = first failed attempt → still no wait (free typo probe), then escalating.
const DELAYS_MS = [0, 0, 5_000, 15_000, 45_000, 120_000, 300_000];

function delayFor(failures: number): number {
  const idx = Math.min(Math.max(failures, 0), DELAYS_MS.length - 1);
  return DELAYS_MS[idx]!;
}

export interface LoginBackoff {
  /** Returns null if allowed, or the wait-ms remaining if blocked. */
  check(identifier: string): number | null;
  recordFailure(identifier: string): void;
  recordSuccess(identifier: string): void;
}

const MAX_DELAY_MS = DELAYS_MS[DELAYS_MS.length - 1]!; // 300s, the capped backoff
const BACKOFF_MAX_KEYS = 50_000;

export function createInMemoryLoginBackoff(): LoginBackoff {
  const state = new Map<string, BackoffState>();

  // Bounds memory: recordFailure is the only growth path (an entry lives until
  // a successful login clears it). Sweep entries whose backoff window elapsed
  // more than a full MAX_DELAY ago — at that point the attacker stopped trying
  // and a future attempt restarts from scratch anyway, so forgetting is safe.
  function evictStale(now: number) {
    for (const [id, s] of state) {
      if (now - s.nextAttemptAt >= MAX_DELAY_MS) state.delete(id);
    }
  }

  return {
    check(identifier: string): number | null {
      const s = state.get(identifier);
      if (!s) return null;
      const now = Date.now();
      if (now >= s.nextAttemptAt) return null;
      return s.nextAttemptAt - now;
    },
    recordFailure(identifier: string): void {
      const now = Date.now();
      if (state.size >= BACKOFF_MAX_KEYS) evictStale(now);
      const existing = state.get(identifier);
      const failures = (existing?.consecutiveFailures ?? 0) + 1;
      state.set(identifier, {
        consecutiveFailures: failures,
        nextAttemptAt: now + delayFor(failures),
      });
    },
    recordSuccess(identifier: string): void {
      state.delete(identifier);
    },
  };
}

export const loginBackoff = createInMemoryLoginBackoff();

/** Exposed for tests / observability. */
export { DELAYS_MS as LOGIN_BACKOFF_DELAYS_MS };
