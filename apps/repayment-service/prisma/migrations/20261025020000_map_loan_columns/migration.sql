ALTER TABLE "loans" RENAME COLUMN "applicationId" TO "application_id";
ALTER TABLE "loans" RENAME COLUMN "customerId" TO "customer_id";
ALTER TABLE "loans" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "loans" RENAME COLUMN "updatedAt" TO "updated_at";

ALTER INDEX "loans_applicationId_key" RENAME TO "loans_application_id_key";
ALTER INDEX "loans_customerId_status_idx" RENAME TO "loans_customer_id_status_idx";
