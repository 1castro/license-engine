import { describe, it, expect } from 'vitest';
import {
  bindingPolicySchema,
  parseBindingPolicy,
  maxActivationsFor,
} from '../../src/lib/binding/binding-policy';

describe('bindingPolicySchema (write-path validation)', () => {
  it('accepts an empty policy', () => {
    expect(bindingPolicySchema.parse({})).toEqual({});
  });

  it('accepts required + maxPerType with valid types and positive ints', () => {
    const p = bindingPolicySchema.parse({
      required: ['domain', 'account'],
      maxPerType: { domain: 1, account: 100 },
    });
    expect(p.required).toEqual(['domain', 'account']);
    expect(p.maxPerType).toEqual({ domain: 1, account: 100 });
  });

  it('rejects an unknown binding type in required', () => {
    expect(bindingPolicySchema.safeParse({ required: ['bogus'] }).success).toBe(false);
  });

  it('rejects a non-positive max (0 or negative)', () => {
    expect(bindingPolicySchema.safeParse({ maxPerType: { account: 0 } }).success).toBe(false);
    expect(bindingPolicySchema.safeParse({ maxPerType: { account: -5 } }).success).toBe(false);
  });

  it('rejects a non-integer max', () => {
    expect(bindingPolicySchema.safeParse({ maxPerType: { account: 1.5 } }).success).toBe(false);
  });

  it('rejects an unknown type as a maxPerType key', () => {
    expect(bindingPolicySchema.safeParse({ maxPerType: { bogus: 3 } }).success).toBe(false);
  });

  it('drops unknown top-level keys (legacy policies remain harmless)', () => {
    const p = bindingPolicySchema.parse({
      maxPerType: { account: 2 },
      composition: 'and',
      types: ['domain'],
    } as Record<string, unknown>);
    expect(p).toEqual({ maxPerType: { account: 2 } });
  });
});

describe('parseBindingPolicy + maxActivationsFor', () => {
  it('parses null/undefined to an empty policy', () => {
    expect(parseBindingPolicy(null)).toEqual({});
    expect(parseBindingPolicy(undefined)).toEqual({});
  });

  it('maxActivationsFor returns the cap or null when unlimited', () => {
    const policy = parseBindingPolicy({ maxPerType: { account: 50 } });
    expect(maxActivationsFor(policy, 'account')).toBe(50);
    expect(maxActivationsFor(policy, 'domain')).toBeNull();
  });
});
