CREATE TYPE "DisbursementStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "DisbursementAttemptStatus" AS ENUM ('SUCCEEDED', 'FAILED');
CREATE TYPE "DisbursementCurrency" AS ENUM ('VND');

CREATE TABLE "disbursements" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" "DisbursementCurrency" NOT NULL DEFAULT 'VND',
    "account_number" TEXT NOT NULL,
    "account_holder_name" TEXT NOT NULL,
    "status" "DisbursementStatus" NOT NULL DEFAULT 'PENDING',
    "loan_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    CONSTRAINT "disbursements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "disbursements_amount_check" CHECK ("amount" BETWEEN 1 AND 9007199254740991)
);

CREATE TABLE "disbursement_attempts" (
    "id" UUID NOT NULL,
    "disbursement_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "DisbursementAttemptStatus" NOT NULL,
    "transaction_reference" TEXT,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "processed_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "disbursement_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "disbursement_attempts_attempt_number_check" CHECK ("attempt_number" > 0)
);

CREATE UNIQUE INDEX "disbursements_application_id_key" ON "disbursements"("application_id");
CREATE UNIQUE INDEX "disbursement_attempts_disbursement_id_attempt_number_key" ON "disbursement_attempts"("disbursement_id", "attempt_number");
CREATE UNIQUE INDEX "disbursement_attempts_one_success_key" ON "disbursement_attempts"("disbursement_id") WHERE "status" = 'SUCCEEDED';

ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "disbursement_attempts" ADD CONSTRAINT "disbursement_attempts_disbursement_id_fkey" FOREIGN KEY ("disbursement_id") REFERENCES "disbursements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
