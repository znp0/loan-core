-- Existing applications require a supplied expiry date; signed snapshots remain unchanged.
ALTER TABLE "loan_applications" ADD COLUMN "identity_expiry_date" DATE;

ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_identity_dates_check"
CHECK ("identity_expiry_date" >= "identity_issued_date");
