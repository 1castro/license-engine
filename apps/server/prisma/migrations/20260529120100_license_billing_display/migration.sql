-- Display-only billing metadata on License, mirrored from the PSP by the sync
-- module. NOT payment logic — purely so admin/customer can see what a license
-- is/costs. Source of truth stays at the PSP. All nullable, additive.
ALTER TABLE "License" ADD COLUMN "planName" TEXT;
ALTER TABLE "License" ADD COLUMN "priceDisplay" TEXT;
ALTER TABLE "License" ADD COLUMN "billingInterval" TEXT;
