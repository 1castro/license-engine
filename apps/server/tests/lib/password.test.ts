import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/lib/auth/password';

describe('password hashing', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('first');
    expect(await verifyPassword('second', hash)).toBe(false);
  });

  it('returns false (not throws) for a malformed hash', async () => {
    expect(await verifyPassword('whatever', 'not-an-argon2-hash')).toBe(false);
  });
});
