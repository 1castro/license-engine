-- CreateEnum
CREATE TYPE "CustomerAuthTokenPurpose" AS ENUM ('set_initial_password', 'reset_password');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "portalLastLoginAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CustomerAuthToken" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "CustomerAuthTokenPurpose" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAuthToken_tokenHash_key" ON "CustomerAuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerAuthToken_customerId_purpose_idx" ON "CustomerAuthToken"("customerId", "purpose");

-- CreateIndex
CREATE INDEX "CustomerAuthToken_expiresAt_idx" ON "CustomerAuthToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "CustomerAuthToken" ADD CONSTRAINT "CustomerAuthToken_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

