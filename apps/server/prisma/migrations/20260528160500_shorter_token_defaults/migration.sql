-- Shorten default token lifetimes so a revoke/expire propagates quickly.
-- Only affects column DEFAULTs for NEW products; existing products keep their
-- configured values (tune them via the product editor if desired).
ALTER TABLE "Product" ALTER COLUMN "recheckIntervalHours" SET DEFAULT 12;
ALTER TABLE "Product" ALTER COLUMN "jwtLifetimeHours" SET DEFAULT 48;
