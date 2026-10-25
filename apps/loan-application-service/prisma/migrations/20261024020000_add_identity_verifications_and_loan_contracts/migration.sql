-- CreateEnum
CREATE TYPE "IdentityVerificationStatus" AS ENUM ('PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "LoanContractStatus" AS ENUM ('DRAFT', 'CUSTOMER_SIGNED', 'EFFECTIVE', 'VOIDED');

-- CreateEnum
CREATE TYPE "LoanContractCurrency" AS ENUM ('VND');

-- CreateEnum
CREATE TYPE "LoanContractInterestCalculationMethod" AS ENUM ('DECLINING_BALANCE_EQUAL_PRINCIPAL');

-- CreateTable
CREATE TABLE "identity_verifications" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "status" "IdentityVerificationStatus" NOT NULL,
    "mismatched_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verified_at" TIMESTAMPTZ(3) NOT NULL,
    "invalidated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_contracts" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "contract_number" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "LoanContractStatus" NOT NULL DEFAULT 'DRAFT',
    "principal_amount" BIGINT NOT NULL,
    "currency" "LoanContractCurrency" NOT NULL DEFAULT 'VND',
    "term_months" INTEGER NOT NULL,
    "annual_interest_rate" DECIMAL(10,4) NOT NULL,
    "interest_calculation_method" "LoanContractInterestCalculationMethod" NOT NULL DEFAULT 'DECLINING_BALANCE_EQUAL_PRINCIPAL',
    "total_interest" BIGINT NOT NULL,
    "total_payable" BIGINT NOT NULL,
    "application_snapshot" JSONB NOT NULL,
    "product_snapshot" JSONB NOT NULL,
    "schedule_preview" JSONB NOT NULL,
    "signed_at" TIMESTAMPTZ(3),
    "content_hash" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "loan_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "identity_verifications_application_id_verified_at_id_idx" ON "identity_verifications"("application_id", "verified_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "loan_contracts_application_id_version_key" ON "loan_contracts"("application_id", "version");

-- AddForeignKey
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_contracts" ADD CONSTRAINT "loan_contracts_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep integer VND values within the existing API's exact JSON-number range.
ALTER TABLE identity_verifications ALTER COLUMN mismatched_fields SET NOT NULL;

ALTER TABLE loan_contracts
  ADD CONSTRAINT ck_contract_version CHECK (version > 0),
  ADD CONSTRAINT ck_contract_term CHECK (term_months > 0),
  ADD CONSTRAINT ck_contract_principal CHECK (principal_amount BETWEEN 1 AND 9007199254740991),
  ADD CONSTRAINT ck_contract_interest CHECK (total_interest BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT ck_contract_total CHECK (
    total_payable BETWEEN 1 AND 9007199254740991 AND
    total_payable = principal_amount + total_interest),
  ADD CONSTRAINT ck_contract_interest_rate CHECK (annual_interest_rate >= 0),
  ADD CONSTRAINT ck_contract_application_snapshot CHECK (jsonb_typeof(application_snapshot) = 'object'),
  ADD CONSTRAINT ck_contract_product_snapshot CHECK (jsonb_typeof(product_snapshot) = 'object'),
  ADD CONSTRAINT ck_contract_schedule_preview CHECK (jsonb_typeof(schedule_preview) = 'array'),
  ADD CONSTRAINT ck_contract_signing_metadata CHECK (
    status NOT IN ('CUSTOMER_SIGNED', 'EFFECTIVE') OR
    (signed_at IS NOT NULL AND content_hash IS NOT NULL AND length(btrim(content_hash)) > 0));
