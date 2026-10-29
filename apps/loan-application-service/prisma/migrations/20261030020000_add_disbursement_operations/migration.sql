ALTER TABLE "disbursements" ADD COLUMN "loan_input" JSONB;

CREATE TABLE "disbursement_operations" (
  "id" UUID NOT NULL PRIMARY KEY,
  "disbursement_id" UUID NOT NULL REFERENCES "disbursements"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "key" VARCHAR(128) NOT NULL,
  "request_hash" TEXT NOT NULL,
  "result" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "disbursement_operations_disbursement_id_key_key" UNIQUE ("disbursement_id", "key")
);
