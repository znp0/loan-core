import "reflect-metadata";

import assert from "node:assert/strict";
import test from "node:test";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import {
  ApplicantInfoDto,
  DisbursementAccountDto,
} from "../dist/modules/loan-applications/loan-applications.dto.js";
import {
  applicationInclude,
  applicationResponse,
} from "../dist/modules/loan-applications/application.response.js";
import { memoryPrisma } from "./memory-prisma.mjs";

test("applicant DTO rejects the removed identity expiry field", async () => {
  const dto = plainToInstance(ApplicantInfoDto, {
    fullName: "Borrower",
    dateOfBirth: "1990-01-02",
    identityNumber: "123456789012",
    identityIssuedDate: "2020-01-01",
    email: "borrower@example.com",
    phone: "0900000000",
    identityExpiryDate: "2030-01-01",
  });
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

  assert.equal(errors.length, 1);
  assert.equal(errors[0].property, "identityExpiryDate");
  assert.ok(errors[0].constraints.whitelistValidation);
});

test("account DTO rejects the removed bank code field", async () => {
  const dto = plainToInstance(DisbursementAccountDto, {
    accountNumber: "123456",
    accountHolderName: "BORROWER",
    bankCode: "TEST",
  });
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

  assert.equal(errors.length, 1);
  assert.equal(errors[0].property, "bankCode");
  assert.ok(errors[0].constraints.whitelistValidation);
});

test("application response omits both removed fields", async () => {
  const prisma = memoryPrisma();
  const application = await prisma.loanApplication.create({
    data: {
      customerId: "00000000-0000-4000-8000-000000000001",
      productId: "00000000-0000-4000-8000-000000000002",
      applicationNumber: "TEST-REMOVED-FIELDS",
      requestedAmount: 2000000n,
      termMonths: 6,
      purpose: "Test response",
      accountNumber: "123456",
      accountHolderName: "BORROWER",
    },
    include: applicationInclude,
  });
  const response = applicationResponse(application);

  assert.equal(Object.hasOwn(response.applicantInfo, "identityExpiryDate"), false);
  assert.equal(Object.hasOwn(response.disbursementAccount, "bankCode"), false);
  assert.deepEqual(response.disbursementAccount, {
    accountNumber: "123456",
    accountHolderName: "BORROWER",
    verificationStatus: "UNVERIFIED",
  });
});
