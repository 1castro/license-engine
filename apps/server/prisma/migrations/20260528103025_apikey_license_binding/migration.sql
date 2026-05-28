-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "licenseId" TEXT;

-- CreateIndex
CREATE INDEX "ApiKey_licenseId_idx" ON "ApiKey"("licenseId");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE SET NULL ON UPDATE CASCADE;
