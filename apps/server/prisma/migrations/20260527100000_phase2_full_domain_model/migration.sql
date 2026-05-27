-- CreateEnum
CREATE TYPE "SigningAlgorithm" AS ENUM ('Ed25519');

-- CreateEnum
CREATE TYPE "ExternalSource" AS ENUM ('manual', 'stripe', 'paddle');

-- CreateEnum
CREATE TYPE "LicenseType" AS ENUM ('subscription', 'perpetual');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('active', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "BindingType" AS ENUM ('domain', 'device', 'account', 'installation');

-- CreateEnum
CREATE TYPE "ActivationStatus" AS ENUM ('active', 'released');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('admin', 'api_key', 'system', 'anonymous');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "activeSigningKeyId" TEXT;

-- CreateTable
CREATE TABLE "SigningKey" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "algorithm" "SigningAlgorithm" NOT NULL DEFAULT 'Ed25519',
    "publicKey" TEXT NOT NULL,
    "privateKeyEncrypted" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),

    CONSTRAINT "SigningKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "notes" TEXT,
    "externalRef" TEXT,
    "externalSource" "ExternalSource" NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "type" "LicenseType" NOT NULL DEFAULT 'subscription',
    "expiresAt" TIMESTAMP(3),
    "featureFlags" JSONB NOT NULL DEFAULT '[]',
    "bindingPolicy" JSONB NOT NULL DEFAULT '{}',
    "status" "LicenseStatus" NOT NULL DEFAULT 'active',
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT,
    "externalRef" TEXT,
    "externalSource" "ExternalSource" NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activation" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "bindingType" "BindingType" NOT NULL,
    "bindingValueHash" TEXT NOT NULL,
    "bindingValueMetadata" JSONB NOT NULL DEFAULT '{}',
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ActivationStatus" NOT NULL DEFAULT 'active',
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "Activation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT NOT NULL,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ipHash" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SigningKey_productId_isActive_idx" ON "SigningKey"("productId", "isActive");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_externalRef_idx" ON "Customer"("externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_externalSource_externalRef_key" ON "Customer"("externalSource", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "License_licenseKey_key" ON "License"("licenseKey");

-- CreateIndex
CREATE INDEX "License_customerId_idx" ON "License"("customerId");

-- CreateIndex
CREATE INDEX "License_productId_idx" ON "License"("productId");

-- CreateIndex
CREATE INDEX "License_status_idx" ON "License"("status");

-- CreateIndex
CREATE INDEX "License_externalRef_idx" ON "License"("externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "License_externalSource_externalRef_key" ON "License"("externalSource", "externalRef");

-- CreateIndex
CREATE INDEX "Activation_licenseId_idx" ON "Activation"("licenseId");

-- CreateIndex
CREATE INDEX "Activation_bindingValueHash_idx" ON "Activation"("bindingValueHash");

-- CreateIndex
CREATE UNIQUE INDEX "Activation_licenseId_bindingType_bindingValueHash_key" ON "Activation"("licenseId", "bindingType", "bindingValueHash");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_eventType_idx" ON "AuditLog"("eventType");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_actorType_actorId_idx" ON "AuditLog"("actorType", "actorId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_activeSigningKeyId_key" ON "Product"("activeSigningKeyId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_activeSigningKeyId_fkey" FOREIGN KEY ("activeSigningKeyId") REFERENCES "SigningKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningKey" ADD CONSTRAINT "SigningKey_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activation" ADD CONSTRAINT "Activation_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;

