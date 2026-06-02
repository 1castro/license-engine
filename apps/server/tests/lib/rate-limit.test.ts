import { describe, it, expect, vi, afterEach } from 'vitest';
import { createInMemoryRateLimiter } from '../../src/lib/auth/rate-limit';

describe('createInMemoryRateLimiter', () => {
  it('allows up to capacity, then blocks further attempts', () => {
    const limiter = createInMemoryRateLimiter({ capacity: 3, refillTokensPerMinute: 0.0001 });
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(false);
  });

  it('isolates buckets per key', () => {
    const limiter = createInMemoryRateLimiter({ capacity: 1, refillTokensPerMinute: 0.0001 });
    expect(limiter.tryConsume('alice')).toBe(true);
    expect(limiter.tryConsume('alice')).toBe(false);
    expect(limiter.tryConsume('bob')).toBe(true);
  });
});

describe('createInMemoryRateLimiter — bounded memory (N10)', () => {
  afterEach(() => vi.useRealTimers());

  it('evicts fully-refilled idle buckets once the soft cap is crossed', () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-01-01T00:00:00Z').getTime();
    vi.setSystemTime(t0);
    // capacity 1, refill 60/min → 1 token/sec → fullRefillMs = 1000ms.
    const limiter = createInMemoryRateLimiter({
      capacity: 1,
      refillTokensPerMinute: 60,
      maxKeys: 5,
    });
    for (let i = 0; i < 5; i++) limiter.tryConsume(`old${i}`);
    expect(limiter.size()).toBe(5);

    // Advance past fullRefillMs so all five are idle + refilled.
    vi.setSystemTime(t0 + 2000);
    // The 6th distinct key crosses maxKeys → the sweep drops the 5 idle ones.
    limiter.tryConsume('new');
    expect(limiter.size()).toBe(1);
  });

  it('does NOT reclaim a still-active (recently consumed) bucket below the cap', () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-01-01T00:00:00Z').getTime();
    vi.setSystemTime(t0);
    // maxKeys high enough that the hard ceiling never triggers here — we only
    // test that the idle sweep does not reclaim an active, non-idle bucket.
    const limiter = createInMemoryRateLimiter({
      capacity: 1,
      refillTokensPerMinute: 60,
      maxKeys: 1000,
    });
    // 'victim' spends its only token now → blocked AND not idle.
    expect(limiter.tryConsume('victim')).toBe(true);
    expect(limiter.tryConsume('victim')).toBe(false);
    // Spray distinct keys at the same instant (well under the cap): no eviction
    // happens at all, so 'victim' stays blocked, not reclaimed.
    for (let i = 0; i < 10; i++) limiter.tryConsume(`spray${i}`);
    expect(limiter.tryConsume('victim')).toBe(false);
  });

  it('enforces a HARD ceiling under a flood of fresh keys (nothing idle to reclaim)', () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-01-01T00:00:00Z').getTime();
    vi.setSystemTime(t0);
    const limiter = createInMemoryRateLimiter({
      capacity: 1,
      refillTokensPerMinute: 60,
      maxKeys: 10,
    });
    // 1000 distinct keys at the SAME instant → none ever become idle/refilled,
    // so the idle sweep frees nothing. The hard ceiling must still bound the map.
    for (let i = 0; i < 1000; i++) limiter.tryConsume(`flood${i}`);
    expect(limiter.size()).toBeLessThanOrEqual(10);
  });
});
