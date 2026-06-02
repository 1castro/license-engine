import { describe, it, expect } from 'vitest';
import { productUpdateSchema, productCreateSchema } from '../../src/lib/services/product-service';

/**
 * N4 regression: the product slug is the JWT audience + the SDK's configured
 * productSlug. It must be immutable after creation, so the UPDATE schema must
 * not carry it through — a stray `slug` in an update payload is silently
 * stripped rather than renaming the product (which would invalidate every
 * issued token).
 */
describe('productUpdateSchema — slug is immutable (N4)', () => {
  it('strips slug from an update payload', () => {
    const parsed = productUpdateSchema.parse({ slug: 'renamed', name: 'New Name' });
    expect('slug' in parsed).toBe(false);
    expect(parsed.name).toBe('New Name');
  });

  it('still allows updating the other fields', () => {
    const parsed = productUpdateSchema.parse({ recheckIntervalHours: 6, jwtLifetimeHours: 24 });
    expect(parsed.recheckIntervalHours).toBe(6);
    expect(parsed.jwtLifetimeHours).toBe(24);
  });

  it('create schema still requires the slug (only update drops it)', () => {
    expect(() => productCreateSchema.parse({ name: 'No Slug' })).toThrow();
    const ok = productCreateSchema.parse({ slug: 'with-slug', name: 'OK' });
    expect(ok.slug).toBe('with-slug');
  });
});
