-- Store the instant at which a customer submits the loan application.
ALTER TABLE "loan_applications"
ADD COLUMN "submitted_at" TIMESTAMPTZ(3);
