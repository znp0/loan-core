ALTER TABLE "loans" ADD COLUMN "closed_at" TIMESTAMPTZ(3);

CREATE TABLE "payments" (
  "id" UUID NOT NULL PRIMARY KEY,
  "loan_id" UUID NOT NULL REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "installment_id" UUID NOT NULL REFERENCES "repayment_installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "key" VARCHAR(128) NOT NULL,
  "amount" BIGINT NOT NULL,
  "principal_amount" BIGINT NOT NULL,
  "interest_amount" BIGINT NOT NULL,
  "paid_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "payments_amount_check" CHECK (
    "amount" BETWEEN 1 AND 9007199254740991 AND
    "principal_amount" BETWEEN 0 AND 9007199254740991 AND
    "interest_amount" BETWEEN 0 AND 9007199254740991 AND
    "amount" = "principal_amount" + "interest_amount"
  )
);

CREATE UNIQUE INDEX "payments_installment_id_key" ON "payments"("installment_id");
CREATE UNIQUE INDEX "payments_loan_id_key_key" ON "payments"("loan_id", "key");
CREATE INDEX "payments_loan_id_paid_at_id_idx" ON "payments"("loan_id", "paid_at" DESC, "id" DESC);
