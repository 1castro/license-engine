import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x?schema=public';
  process.env.APP_BASE_URL ??= 'http://localhost:3000';
  process.env.JWT_ISSUER ??= 'license.test';
  process.env.NEXTAUTH_SECRET ??= 'test-secret-must-be-at-least-32-characters-long-yes';
  process.env.NEXTAUTH_URL ??= 'http://localhost:3000';
  process.env.ENCRYPTION_KEY ??= Buffer.from(new Uint8Array(32)).toString('base64');
});

/**
 * Guard: every audit event must be classified into exactly one retention class.
 * Pruning is fail-safe (an unclassified event is never deleted), so a forgotten
 * event would silently accumulate forever — this test surfaces that early.
 */
describe('audit-retention classification is exhaustive', () => {
  it('puts every AuditEventType in exactly one of CRITICAL / ROUTINE', async () => {
    const { CRITICAL_EVENTS, ROUTINE_EVENTS } = await import(
      '../../src/lib/services/audit-retention'
    );
    const { AuditEventType } = await import('../../src/lib/audit/event-types');

    const all = Object.values(AuditEventType);
    const critical = new Set<string>(CRITICAL_EVENTS);
    const routine = new Set<string>(ROUTINE_EVENTS);

    for (const ev of all) {
      const inC = critical.has(ev);
      const inR = routine.has(ev);
      expect(inC || inR, `event "${ev}" is unclassified`).toBe(true);
      expect(inC && inR, `event "${ev}" is in BOTH classes`).toBe(false);
    }

    // And no stale classification entries that aren't real events.
    const allSet = new Set<string>(all);
    for (const ev of [...CRITICAL_EVENTS, ...ROUTINE_EVENTS]) {
      expect(allSet.has(ev), `classified "${ev}" is not a known AuditEventType`).toBe(true);
    }
  });
});
