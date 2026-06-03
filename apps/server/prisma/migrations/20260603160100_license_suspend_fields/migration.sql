-- Pause metadata on License (set on suspend, cleared on reactivate). Seats are
-- HELD while suspended — these fields are bookkeeping only. Nullable, additive.
ALTER TABLE "License" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "License" ADD COLUMN "suspendReason" TEXT;
