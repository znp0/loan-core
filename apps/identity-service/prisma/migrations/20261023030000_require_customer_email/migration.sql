-- Existing customers must have an email before this constraint can be applied.
ALTER TABLE "Customer" ALTER COLUMN "email" SET NOT NULL;
