import type { SchemaObject } from "@nestjs/swagger";

import { jsonArray, jsonObject } from "@repo/http";

const text: SchemaObject = { type: "string" };
const nullableText: SchemaObject = { ...text, nullable: true };
const uuid: SchemaObject = { type: "string", format: "uuid" };
const timestamp: SchemaObject = { type: "string", format: "date-time" };
const date: SchemaObject = { type: "string", format: "date", nullable: true };
const money: SchemaObject = {
  type: "integer",
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
  description: "Amount in VND.",
};
const verificationStatus: SchemaObject = {
  type: "string",
  enum: ["UNVERIFIED", "VERIFIED", "FAILED"],
};

export const documentSchema = jsonObject({
  id: uuid,
  type: { type: "string", enum: ["ID_FRONT", "ID_BACK"] },
  fileName: text,
  contentType: text,
  size: { type: "integer", description: "File size in bytes." },
  uploadedAt: timestamp,
});

export const applicationSchema = jsonObject({
  id: uuid,
  applicationNumber: text,
  customerId: uuid,
  productId: uuid,
  status: { type: "string", enum: ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "DISBURSED"] },
  requestedAmount: money,
  termMonths: { type: "integer" },
  purpose: text,
  applicantInfo: jsonObject({
    fullName: nullableText,
    dateOfBirth: date,
    identityNumber: nullableText,
    identityIssuedDate: date,
    identityExpiryDate: date,
    email: nullableText,
    phone: nullableText,
  }),
  currentAddress: jsonObject({
    addressLine: nullableText,
    ward: nullableText,
    district: nullableText,
    province: nullableText,
  }),
  employmentInfo: jsonObject({
    employmentType: {
      type: "string",
      enum: ["SALARIED", "SELF_EMPLOYED", "OTHER", null],
      nullable: true,
    },
    employerName: nullableText,
    jobTitle: nullableText,
    employmentStartDate: date,
  }),
  financialInfo: jsonObject({
    monthlyIncome: { ...money, nullable: true },
    otherMonthlyIncome: { ...money, nullable: true },
  }),
  contacts: jsonArray(jsonObject({ fullName: text, relationship: text, phone: text })),
  disbursementAccount: jsonObject({
    accountNumber: nullableText,
    accountHolderName: nullableText,
    verificationStatus,
  }),
  documents: jsonArray(documentSchema),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const identityVerificationSchema = jsonObject({
  id: uuid,
  applicationId: uuid,
  status: { type: "string", enum: ["PASSED", "FAILED"] },
  mismatchedFields: jsonArray(text),
  verifiedAt: timestamp,
});

export const accountVerificationSchema = jsonObject({
  status: { type: "string", enum: ["VERIFIED", "FAILED"] },
  maskedAccountNumber: text,
  accountHolderName: text,
  mismatchedFields: jsonArray(text),
  verifiedAt: timestamp,
});

export const readinessSchema = jsonObject({
  valid: { type: "boolean" },
  checkedAt: timestamp,
  checks: jsonArray(
    jsonObject({
      code: text,
      field: text,
      status: { type: "string", enum: ["PASSED", "FAILED"] },
      message: text,
    }),
  ),
});

const schedulePreview = jsonArray(
  jsonObject({
    installmentNumber: { type: "integer" },
    principalAmount: money,
    interestAmount: money,
    totalAmount: money,
  }),
);

export const contractSchema = jsonObject({
  id: uuid,
  applicationId: uuid,
  contractNumber: text,
  version: { type: "integer" },
  status: { type: "string", enum: ["DRAFT", "CUSTOMER_SIGNED", "EFFECTIVE", "VOIDED"] },
  terms: jsonObject({
    principalAmount: money,
    currency: { type: "string", enum: ["VND"] },
    termMonths: { type: "integer" },
    annualInterestRate: { type: "number", description: "Annual percentage rate." },
    interestCalculationMethod: { type: "string", enum: ["DECLINING_BALANCE_EQUAL_PRINCIPAL"] },
  }),
  schedulePreview,
  totalPrincipal: money,
  totalInterest: money,
  totalPayable: money,
  signedAt: { ...timestamp, nullable: true },
  contentHash: nullableText,
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const submissionSchema = jsonObject({
  applicationId: uuid,
  applicationStatus: { type: "string", enum: ["SUBMITTED"] },
  submittedAt: timestamp,
  contract: jsonObject({
    id: uuid,
    version: { type: "integer" },
    status: { type: "string", enum: ["CUSTOMER_SIGNED"] },
    signedAt: timestamp,
    contentHash: text,
  }),
});

export const reviewSchema = jsonObject({
  application: applicationSchema,
  productTerms: {
    ...jsonObject({
      id: uuid,
      minAmount: money,
      maxAmount: money,
      allowedTerms: jsonArray({ type: "integer" }),
      annualInterestRate: { oneOf: [{ type: "number" }, { type: "string" }] },
      minAge: { type: "integer" },
      maxAge: { type: "integer" },
      requiredDocumentTypes: jsonArray({ type: "string", enum: ["ID_FRONT", "ID_BACK"] }),
    }),
    description:
      "Product terms saved with the contract, using a decimal string rate; current product terms with a numeric rate and product metadata when no contract exists.",
  },
  contract: { ...contractSchema, nullable: true },
});

export const disbursementSchema = jsonObject({
  id: uuid,
  applicationId: uuid,
  amount: money,
  currency: { type: "string", enum: ["VND"] },
  destinationAccount: jsonObject({ maskedAccountNumber: text, accountHolderName: text }),
  status: { type: "string", enum: ["PENDING", "PROCESSING", "SUCCEEDED", "FAILED"] },
  attempts: jsonArray(
    jsonObject({
      id: uuid,
      attemptNumber: { type: "integer" },
      status: { type: "string", enum: ["SUCCEEDED", "FAILED"] },
      transactionReference: nullableText,
      failureCode: nullableText,
      failureMessage: nullableText,
      processedAt: timestamp,
    }),
  ),
  loanId: { ...uuid, nullable: true },
  createdAt: timestamp,
  completedAt: { ...timestamp, nullable: true },
});
