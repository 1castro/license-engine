import { describe, it, expect } from 'vitest';
import { getActiveLicensesOverview } from '@/lib/services/dashboard-service';
import { seedLicenseChain, callActivate } from './helpers';

const domain = { type: 'domain', value: 'x.test', metadata: {} };
const account = (v: string) => ({ type: 'account', value: v, metadata: { displayName: v } });

describe('Dashboard-Übersicht — Seat-Anzeige', () => {
  it('zeigt unbegrenzte account-Seats (max:null) mit Live-Count + Domain zuerst', async () => {
    // account NICHT in maxPerType → unbegrenzt (Mandanten-Setup wie FidiBus/Shuttle).
    const { license } = await seedLicenseChain({ required: ['domain'], maxPerType: { domain: 1 } });
    // domain muss in jedem activate dabei sein (required); re-senden ist idempotent.
    await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [domain, account('u-a')] },
      '203.0.113.220',
    );
    await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [domain, account('u-b')] },
      '203.0.113.220',
    );

    const overview = await getActiveLicensesOverview();
    const row = overview.find((l) => l.id === license.id);
    expect(row).toBeDefined();
    // Reihenfolge: Domain zuerst, dann Nutzer.
    expect(row!.seats.map((s) => s.type)).toEqual(['domain', 'account']);
    expect(row!.seats).toContainEqual({ type: 'domain', used: 1, max: 1 });
    // Unbegrenzt (max:null → UI rendert "∞"), aber Live-Count wird gezählt.
    expect(row!.seats).toContainEqual({ type: 'account', used: 2, max: null });
  });

  it('stabile Domain-zuerst-Reihenfolge auch wenn die Policy account zuerst listet', async () => {
    const { license } = await seedLicenseChain({
      required: ['domain'],
      maxPerType: { account: 2, domain: 1 }, // bewusst account vor domain
    });
    await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [domain, account('u-a')] },
      '203.0.113.221',
    );

    const overview = await getActiveLicensesOverview();
    const row = overview.find((l) => l.id === license.id);
    expect(row!.seats.map((s) => s.type)).toEqual(['domain', 'account']);
    expect(row!.seats).toContainEqual({ type: 'account', used: 1, max: 2 });
  });
});
