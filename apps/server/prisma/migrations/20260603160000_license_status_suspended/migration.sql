-- Reversible "pause" as a first-class license status, distinct from the terminal
-- `revoked`. Additive enum value; not used within this migration (safe on PG16).
ALTER TYPE "LicenseStatus" ADD VALUE 'suspended';
