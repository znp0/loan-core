-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('SALARIED', 'SELF_EMPLOYED', 'OTHER');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApplicationDocumentType" AS ENUM ('ID_FRONT', 'ID_BACK');

-- CreateTable
CREATE TABLE "loan_applications" (
    "id" UUID NOT NULL,
    "application_number" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "requested_amount" BIGINT NOT NULL,
    "term_months" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "full_name" TEXT,
    "date_of_birth" DATE,
    "identity_number" TEXT,
    "identity_issued_date" DATE,
    "identity_expiry_date" DATE,
    "email" TEXT,
    "phone" TEXT,
    "address_line" TEXT,
    "ward" TEXT,
    "district" TEXT,
    "province" TEXT,
    "employment_type" "EmploymentType",
    "employer_name" TEXT,
    "job_title" TEXT,
    "employment_start_date" DATE,
    "monthly_income" BIGINT,
    "other_monthly_income" BIGINT,
    "bank_code" TEXT,
    "account_number" TEXT,
    "account_holder_name" TEXT,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "loan_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_contacts" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "full_name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,

    CONSTRAINT "application_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_documents" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "type" "ApplicationDocumentType" NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "uploaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loan_applications_application_number_key" ON "loan_applications"("application_number");

-- CreateIndex
CREATE INDEX "loan_applications_customer_id_created_at_idx" ON "loan_applications"("customer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "loan_applications_product_id_idx" ON "loan_applications"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_contacts_application_id_phone_key" ON "application_contacts"("application_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "application_contacts_application_id_position_key" ON "application_contacts"("application_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "application_documents_storage_key_key" ON "application_documents"("storage_key");

-- CreateIndex
CREATE INDEX "application_documents_application_id_type_uploaded_at_idx" ON "application_documents"("application_id", "type", "uploaded_at" DESC);

-- AddForeignKey
ALTER TABLE "application_contacts" ADD CONSTRAINT "application_contacts_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Serialize current versions and active applications even for writers outside
-- the Nest service. APPROVED remains blocking until repayment owns settlement.
CREATE UNIQUE INDEX uq_application_current_document
ON application_documents (application_id, type) WHERE is_current = true;

CREATE UNIQUE INDEX uq_customer_active_application
ON loan_applications (customer_id) WHERE status IN ('DRAFT', 'SUBMITTED', 'APPROVED');

ALTER TABLE loan_applications
  ADD CONSTRAINT ck_application_amount CHECK (requested_amount BETWEEN 1 AND 9007199254740991),
  ADD CONSTRAINT ck_application_term CHECK (term_months > 0),
  ADD CONSTRAINT ck_application_income CHECK (
    (monthly_income IS NULL OR monthly_income BETWEEN 0 AND 9007199254740991) AND
    (other_monthly_income IS NULL OR other_monthly_income BETWEEN 0 AND 9007199254740991));

ALTER TABLE application_contacts
  ADD CONSTRAINT ck_contact_position CHECK (position IN (0, 1));

ALTER TABLE application_documents
  ADD CONSTRAINT ck_document_size CHECK (size BETWEEN 1 AND 10485760),
  ADD CONSTRAINT ck_document_content_type CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png'));
