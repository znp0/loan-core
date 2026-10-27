import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../generated/prisma/client";
import {
  ApplicationNotFoundException,
  DependencyUnavailableException,
  ForbiddenException,
} from "../../common/exceptions/app.exceptions";
import { IdentityVerificationStatus, VerificationStatus } from "../../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";

type ProductTerms = {
  id: string;
  minAmount: number;
  maxAmount: number;
  allowedTerms: number[];
  annualInterestRate: string;
  minAge: number;
  maxAge: number;
  requiredDocumentTypes: string[];
};

type Check = {
  code: string;
  field: string;
  status: "PASSED" | "FAILED";
  message: string;
};

function nonblank(value: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function vietnamDate(value: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return {
    year,
    month,
    day,
  };
}

function isProductTerms(value: unknown, productId: string): value is ProductTerms {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const terms = value as Partial<ProductTerms>;
  return (
    terms.id === productId &&
    Number.isSafeInteger(terms.minAmount) &&
    Number.isSafeInteger(terms.maxAmount) &&
    Array.isArray(terms.allowedTerms) &&
    terms.allowedTerms.every(Number.isInteger) &&
    typeof terms.annualInterestRate === "string" &&
    /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(terms.annualInterestRate) &&
    Number.isInteger(terms.minAge) &&
    Number.isInteger(terms.maxAge) &&
    Array.isArray(terms.requiredDocumentTypes) &&
    terms.requiredDocumentTypes.every((item) => typeof item === "string")
  );
}

@Injectable()
export class ValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(applicationId: string, customerId: string) {
    const evaluation = await this.evaluate(applicationId, customerId);

    return evaluation.result;
  }

  async evaluate(
    applicationId: string,
    customerId: string,
    database: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const application = await database.loanApplication.findUnique({
      where: { id: applicationId },
      include: {
        contacts: true,
        documents: true,
        identityVerifications: {
          orderBy: [{ verifiedAt: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
    });
    if (!application) {
      throw new ApplicationNotFoundException();
    }
    if (application.customerId !== customerId) {
      throw new ForbiddenException();
    }

    const [product, hasActiveLoan, activeApplications] = await Promise.all([
      this.productTerms(application.productId),
      this.activeLoan(customerId),
      database.loanApplication.count({
        where: {
          customerId,
          id: { not: applicationId },
          status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] },
        },
      }),
    ]);

    const checkedAt = new Date();
    const today = vietnamDate(checkedAt);
    const checks: Check[] = [];
    const add = (code: string, field: string, passed: boolean, failure: string): void => {
      checks.push({
        code,
        field,
        status: passed ? "PASSED" : "FAILED",
        message: passed ? "Passed." : failure,
      });
    };

    const missingApplication = [
      ["purpose", application.purpose],
      ["applicantInfo.fullName", application.fullName],
      ["applicantInfo.email", application.email],
      ["applicantInfo.phone", application.phone],
      ["applicantInfo.identityNumber", application.identityNumber],
    ]
      .filter(([, value]) => !nonblank(value as string | null))
      .map(([field]) => field);
    for (const [field, value] of [
      ["dateOfBirth", application.dateOfBirth],
      ["identityIssuedDate", application.identityIssuedDate],
    ] as const) {
      if (!value) {
        missingApplication.push(`applicantInfo.${field}`);
      }
    }
    add(
      "REQUIRED_APPLICATION",
      "application",
      missingApplication.length === 0,
      `Missing: ${missingApplication.join(", ")}.`,
    );

    const missingAddress = [
      ["addressLine", application.addressLine],
      ["ward", application.ward],
      ["district", application.district],
      ["province", application.province],
    ]
      .filter(([, value]) => !nonblank(value as string | null))
      .map(([field]) => field);
    add(
      "CURRENT_ADDRESS",
      "currentAddress",
      missingAddress.length === 0,
      `Missing: ${missingAddress.join(", ")}.`,
    );

    const missingEmployment: string[] = [];
    if (!application.employmentType) {
      missingEmployment.push("employmentType");
    }
    if (application.employmentType === "SALARIED") {
      if (!nonblank(application.employerName)) {
        missingEmployment.push("employerName");
      }
      if (!nonblank(application.jobTitle)) {
        missingEmployment.push("jobTitle");
      }
      if (!application.employmentStartDate) {
        missingEmployment.push("employmentStartDate");
      }
    }
    add(
      "EMPLOYMENT",
      "employmentInfo",
      missingEmployment.length === 0,
      `Missing: ${missingEmployment.join(", ")}.`,
    );

    const contacts = application.contacts;
    const completeContacts =
      contacts.length === 2 &&
      contacts.every(
        (contact) =>
          nonblank(contact.fullName) && nonblank(contact.relationship) && nonblank(contact.phone),
      );
    const distinctPhones =
      contacts.length === 2 && contacts[0]?.phone.trim() !== contacts[1]?.phone.trim();
    add(
      "CONTACTS",
      "contacts",
      completeContacts && distinctPhones,
      "Provide two complete contacts with different phone numbers.",
    );

    const birth = application.dateOfBirth?.toISOString().slice(0, 10);
    const birthYear = birth ? Number(birth.slice(0, 4)) : 0;
    const birthMonth = birth ? Number(birth.slice(5, 7)) : 0;
    const birthDay = birth ? Number(birth.slice(8, 10)) : 0;
    const age = birth
      ? today.year -
        birthYear -
        Number(today.month < birthMonth || (today.month === birthMonth && today.day < birthDay))
      : null;
    add(
      "AGE",
      "applicantInfo.dateOfBirth",
      Boolean(product && age !== null && age >= product.minAge && age <= product.maxAge),
      "Applicant age is outside the product limits or cannot be checked.",
    );
    add(
      "MONTHLY_INCOME",
      "financialInfo.monthlyIncome",
      application.monthlyIncome !== null && application.monthlyIncome > 0n,
      "Monthly income must be greater than zero.",
    );
    add(
      "AMOUNT",
      "requestedAmount",
      Boolean(
        product &&
        application.requestedAmount >= BigInt(product.minAmount) &&
        application.requestedAmount <= BigInt(product.maxAmount),
      ),
      "Requested amount is outside the product limits or cannot be checked.",
    );
    add(
      "TERM",
      "termMonths",
      Boolean(product?.allowedTerms.includes(application.termMonths)),
      "Term is not allowed by the product or cannot be checked.",
    );
    const latestIdentity = application.identityVerifications[0];
    add(
      "IDENTITY_VERIFICATION",
      "identityVerification",
      latestIdentity?.status === IdentityVerificationStatus.PASSED &&
        latestIdentity.invalidatedAt === null,
      "The latest identity verification must be PASSED and current.",
    );
    const currentDocuments = new Set<string>(
      application.documents
        .filter((document) => document.isCurrent)
        .map((document) => document.type),
    );
    const missingDocuments = product?.requiredDocumentTypes.filter(
      (type) => !currentDocuments.has(type),
    );
    add(
      "REQUIRED_DOCUMENTS",
      "documents",
      Boolean(missingDocuments && missingDocuments.length === 0),
      product
        ? `Missing current documents: ${missingDocuments?.join(", ")}.`
        : "Product terms are unavailable.",
    );
    add(
      "DISBURSEMENT_ACCOUNT",
      "disbursementAccount",
      application.accountVerificationStatus === VerificationStatus.VERIFIED &&
        nonblank(application.accountNumber) &&
        nonblank(application.accountHolderName),
      "Complete and verify the disbursement account.",
    );
    add(
      "ACTIVE_APPLICATION",
      "applicationId",
      activeApplications === 0,
      "Another active loan application exists.",
    );
    add("ACTIVE_LOAN", "customerId", !hasActiveLoan, "An unpaid loan already exists.");

    return {
      result: {
        valid: checks.every((check) => check.status === "PASSED"),
        checks,
        checkedAt: checkedAt.toISOString(),
      },
      application,
      product,
    };
  }

  private async productTerms(productId: string): Promise<ProductTerms | null> {
    const base = process.env.LOAN_PRODUCT_SERVICE_URL;
    const token = process.env.PRODUCT_INTERNAL_TOKEN;
    if (!base || !token) {
      throw new DependencyUnavailableException();
    }
    let response: Response;
    try {
      response = await fetch(
        `${base.replace(/\/$/, "")}/api/v1/internal/loan-products/${productId}/validation-terms`,
        {
          headers: { "X-Internal-Service-Token": token },
          signal: AbortSignal.timeout(3000),
        },
      );
    } catch {
      throw new DependencyUnavailableException();
    }
    if (response.status === 404) {
      try {
        const body: unknown = await response.json();
        if (
          typeof body === "object" &&
          body !== null &&
          "code" in body &&
          body.code === "PRODUCT_NOT_FOUND"
        ) {
          return null;
        }
      } catch {
        throw new DependencyUnavailableException();
      }
      throw new DependencyUnavailableException();
    }
    if (!response.ok) {
      throw new DependencyUnavailableException();
    }
    try {
      const value: unknown = await response.json();
      if (isProductTerms(value, productId)) {
        return value;
      }
    } catch {
      throw new DependencyUnavailableException();
    }
    throw new DependencyUnavailableException();
  }

  private async activeLoan(customerId: string): Promise<boolean> {
    const base = process.env.REPAYMENT_SERVICE_URL;
    const token = process.env.REPAYMENT_INTERNAL_TOKEN;
    if (!base || !token) {
      throw new DependencyUnavailableException();
    }
    let response: Response;
    try {
      response = await fetch(
        `${base.replace(/\/$/, "")}/api/v1/internal/customers/${customerId}/active-loan`,
        {
          headers: { "X-Internal-Service-Token": token },
          signal: AbortSignal.timeout(3000),
        },
      );
    } catch {
      throw new DependencyUnavailableException();
    }
    if (!response.ok) {
      throw new DependencyUnavailableException();
    }
    try {
      const value: unknown = await response.json();
      if (
        typeof value === "object" &&
        value !== null &&
        "hasActiveLoan" in value &&
        typeof value.hasActiveLoan === "boolean"
      ) {
        return value.hasActiveLoan;
      }
    } catch {
      throw new DependencyUnavailableException();
    }
    throw new DependencyUnavailableException();
  }
}
