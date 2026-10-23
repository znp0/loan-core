-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LoanProductStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "LoanProductCurrency" AS ENUM ('VND');

-- CreateEnum
CREATE TYPE "LoanProductDocumentType" AS ENUM ('ID_FRONT', 'ID_BACK');

-- CreateTable
CREATE TABLE "loan_products" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "LoanProductStatus" NOT NULL,
    "currency" "LoanProductCurrency" NOT NULL DEFAULT 'VND',
    "min_amount" BIGINT NOT NULL,
    "max_amount" BIGINT NOT NULL,
    "allowed_terms" INTEGER[],
    "annual_interest_rate" DECIMAL(10,4) NOT NULL,
    "min_age" INTEGER NOT NULL,
    "max_age" INTEGER NOT NULL,
    "required_document_types" "LoanProductDocumentType"[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "loan_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loan_products_status_created_at_id_idx" ON "loan_products"("status", "created_at" DESC, "id" DESC);
