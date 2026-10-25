-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'OVERDUE', 'CLOSED');

-- CreateTable
CREATE TABLE "Loan" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Loan_applicationId_key" ON "Loan"("applicationId");

-- CreateIndex
CREATE INDEX "Loan_customerId_status_idx" ON "Loan"("customerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_customer_active_loan" ON "Loan"("customerId") WHERE (status = ANY (ARRAY['ACTIVE'::"LoanStatus", 'OVERDUE'::"LoanStatus"]));
