import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createInMemoryLoginBackoff,
  LOGIN_BACKOFF_DELAYS_MS,
} from '../../src/lib/auth/login-backoff';

afterEach(() => {
  vi.useRealTimers();
});

describe('createInMemoryLoginBackoff', () => {
  it('lets the first attempt through with no wait', () => {
    const b = createInMemoryLoginBackoff();
    expect(b.check('alice')).toBeNull();
  });

  it('blocks subsequent attempts with increasing delay', () => {
    const t0 = 1_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(t0);

    const b = createInMemoryLoginBackoff();

    // 1st failure → delay = 0 (free probe)
    b.recordFailure('alice');
    expect(b.check('alice')).toBeNull();

    // 2nd failure → 5s
    b.recordFailure('alice');
    expect(b.check('alice')).toBe(LOGIN_BACKOFF_DELAYS_MS[2]);

    // After 5s the door opens again
    vi.setSystemTime(t0 + LOGIN_BACKOFF_DELAYS_MS[2]!);
    expect(b.check('alice')).toBeNull();

    // 3rd failure → 15s
    b.recordFailure('alice');
    expect(b.check('alice')).toBe(LOGIN_BACKOFF_DELAYS_MS[3]);
  });

  it('caps the delay at the longest entry once exceeded', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);

    const b = createInMemoryLoginBackoff();
    for (let i = 0; i < 12; i++) b.recordFailure('bob');
    expect(b.check('bob')).toBe(LOGIN_BACKOFF_DELAYS_MS.at(-1));
  });

  it('clears state on success', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);

    const b = createInMemoryLoginBackoff();
    b.recordFailure('carol');
    b.recordFailure('carol');
    expect(b.check('carol')).toBeGreaterThan(0);

    b.recordSuccess('carol');
    expect(b.check('carol')).toBeNull();
  });

  it('isolates state per identifier', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);

    const b = createInMemoryLoginBackoff();
    b.recordFailure('alice');
    b.recordFailure('alice');
    expect(b.check('alice')).toBeGreaterThan(0);
    expect(b.check('bob')).toBeNull();
  });
});
