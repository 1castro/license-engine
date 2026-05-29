import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/prisma';
import { pruneAuditLog } from '@/lib/services/audit-retention';

const NOW = new Date('2026-06-01T00:00:00.000Z');
const daysBefore = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);

async function addEvent(eventType: string, timestamp: Date) {
  await prisma.auditLog.create({
    data: { eventType, actorType: 'system', timestamp, metadata: {} },
  });
}

describe('pruneAuditLog — differentiated retention', () => {
  it('removes old routine events but keeps critical ones within the long window', async () => {
    // routine = activation.created; critical = activation.rejected
    await addEvent('activation.created', daysBefore(200)); // routine, > 90d  → delete
    await addEvent('activation.created', daysBefore(10)); //  routine, < 90d  → keep
    await addEvent('activation.rejected', daysBefore(200)); // critical, < 365d → keep
    await addEvent('activation.rejected', daysBefore(400)); // critical, > 365d → delete

    const res = await pruneAuditLog({ now: NOW, routineDays: 90, criticalDays: 365 });

    expect(res.routineDeleted).toBe(1);
    expect(res.criticalDeleted).toBe(1);

    const remaining = await prisma.auditLog.findMany({ orderBy: { timestamp: 'asc' } });
    expect(remaining).toHaveLength(2);
    const types = remaining.map((r) => r.eventType).sort();
    expect(types).toEqual(['activation.created', 'activation.rejected']);
    // The surviving rejected event is the 200-days-old one (within 365d).
    const rejected = remaining.find((r) => r.eventType === 'activation.rejected');
    expect(rejected?.timestamp.toISOString()).toBe(daysBefore(200).toISOString());
  });

  it('is a no-op when nothing is past its window', async () => {
    await addEvent('activation.created', daysBefore(5));
    await addEvent('activation.rejected', daysBefore(5));
    const res = await pruneAuditLog({ now: NOW, routineDays: 90, criticalDays: 365 });
    expect(res.routineDeleted).toBe(0);
    expect(res.criticalDeleted).toBe(0);
    expect(await prisma.auditLog.count()).toBe(2);
  });
});
