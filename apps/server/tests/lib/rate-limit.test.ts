import { describe, it, expect } from 'vitest';
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
