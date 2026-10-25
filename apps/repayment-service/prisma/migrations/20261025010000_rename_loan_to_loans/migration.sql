ALTER TABLE "Loan" RENAME TO "loans";

ALTER TABLE "loans" RENAME CONSTRAINT "Loan_pkey" TO "loans_pkey";

ALTER INDEX "Loan_applicationId_key" RENAME TO "loans_applicationId_key";
ALTER INDEX "Loan_customerId_status_idx" RENAME TO "loans_customerId_status_idx";
