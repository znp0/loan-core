CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

CREATE TABLE "repayment_installments" (
    "id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "installment_number" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "opening_principal" BIGINT NOT NULL,
    "principal_amount" BIGINT NOT NULL,
    "interest_amount" BIGINT NOT NULL,
    "total_amount" BIGINT NOT NULL,
    "paid_principal" BIGINT NOT NULL DEFAULT 0,
    "paid_interest" BIGINT NOT NULL DEFAULT 0,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING',
    CONSTRAINT "repayment_installments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "repayment_installments_amount_check" CHECK ("opening_principal" BETWEEN 0 AND 9007199254740991 AND "principal_amount" BETWEEN 0 AND 9007199254740991 AND "interest_amount" BETWEEN 0 AND 9007199254740991 AND "total_amount" BETWEEN 0 AND 9007199254740991 AND "paid_principal" BETWEEN 0 AND 9007199254740991 AND "paid_interest" BETWEEN 0 AND 9007199254740991 AND "total_amount" = "principal_amount" + "interest_amount" AND "paid_principal" <= "principal_amount" AND "paid_interest" <= "interest_amount"),
    CONSTRAINT "repayment_installments_number_check" CHECK ("installment_number" > 0)
);

CREATE UNIQUE INDEX "repayment_installments_loan_id_installment_number_key" ON "repayment_installments"("loan_id", "installment_number");
ALTER TABLE "repayment_installments" ADD CONSTRAINT "repayment_installments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
