ALTER TABLE "loans"
  ADD COLUMN "contract_id" UUID,
  ADD COLUMN "creation_hash" TEXT,
  ADD COLUMN "disbursed_at" TIMESTAMPTZ(3);
