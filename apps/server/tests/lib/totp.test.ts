import { describe, it, expect } from 'vitest';
import { authenticator } from 'otplib';
import { generateTotpSecret, verifyTotp } from '../../src/lib/auth/totp';

describe('TOTP', () => {
  it('accepts a freshly generated code', () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    const result = verifyTotp({ token: code, secret, lastUsedStep: 0n });
    expect(result.valid).toBe(true);
    expect(result.usedStep).toBeDefined();
  });

  it('rejects malformed input (non-numeric, wrong length)', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp({ token: 'abcdef', secret, lastUsedStep: 0n }).valid).toBe(false);
    expect(verifyTotp({ token: '12345', secret, lastUsedStep: 0n }).valid).toBe(false);
    expect(verifyTotp({ token: '1234567', secret, lastUsedStep: 0n }).valid).toBe(false);
  });

  it('rejects a wrong code', () => {
    const secret = generateTotpSecret();
    const result = verifyTotp({ token: '000000', secret, lastUsedStep: 0n });
    expect(result.valid).toBe(false);
  });

  it('rejects replay: same step cannot be reused', () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);

    const first = verifyTotp({ token: code, secret, lastUsedStep: 0n });
    expect(first.valid).toBe(true);
    expect(first.usedStep).toBeDefined();

    const second = verifyTotp({
      token: code,
      secret,
      lastUsedStep: first.usedStep!,
    });
    expect(second.valid).toBe(false);
  });
});
