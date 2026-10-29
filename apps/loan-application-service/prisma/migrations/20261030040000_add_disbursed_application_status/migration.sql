ALTER TYPE "ApplicationStatus" ADD VALUE 'DISBURSED';

-- uq_customer_active_application intentionally covers DRAFT/SUBMITTED/APPROVED only.
-- Status changes require confirmed loan evidence from repayment, never a data-only backfill.
