-- DropIndex
DROP INDEX "Customer_email_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

