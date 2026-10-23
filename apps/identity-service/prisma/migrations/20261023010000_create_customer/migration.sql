CREATE TYPE "Role" AS ENUM ('CUSTOMER');

CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Customer_email_lowercase" CHECK ("email" = lower("email"))
);

CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");
