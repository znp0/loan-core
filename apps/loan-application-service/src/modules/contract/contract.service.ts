import { Injectable } from "@nestjs/common";

import {
  ApplicationNotFoundException,
  ApplicationNotReadyException,
  ContractApplicationNotEditableException,
  ContractNotFoundException,
  DependencyUnavailableException,
  ForbiddenException,
} from "../../common/exceptions/app.exceptions";
import { type LoanContract } from "../../generated/prisma/client";
import type { AccessRole } from "../../common/guards/customer-access.guard";
import { PrismaService } from "../prisma/prisma.service";
import { ValidationService } from "../validation/validation.service";
import { buildContractSchedule } from "./contract-schedule";

type LockedApplication = {
  id: string;
  customerId: string;
  status: string;
};

function date(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

function decimalNumber(value: unknown): number {
  if (typeof value === "string") {
    return Number(value);
  }

  if (typeof value === "object" && value !== null && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }

  throw new TypeError("Unexpected decimal value.");
}

function amountNumber(value: bigint): number {
  const result = Number(value);

  if (!Number.isSafeInteger(result)) {
    throw new RangeError("Contract amount exceeds the JSON safe integer range.");
  }

  return result;
}

function contractResponse(contract: LoanContract, schedulePreview = contract.schedulePreview) {
  return {
    id: contract.id,
    applicationId: contract.applicationId,
    contractNumber: contract.contractNumber,
    version: contract.version,
    status: contract.status,
    terms: {
      principalAmount: amountNumber(contract.principalAmount),
      currency: contract.currency,
      termMonths: contract.termMonths,
      annualInterestRate: decimalNumber(contract.annualInterestRate),
      interestCalculationMethod: contract.interestCalculationMethod,
    },
    schedulePreview,
    totalPrincipal: amountNumber(contract.principalAmount),
    totalInterest: amountNumber(contract.totalInterest),
    totalPayable: amountNumber(contract.totalPayable),
    signedAt: contract.signedAt?.toISOString() ?? null,
    contentHash: contract.contentHash,
    createdAt: contract.createdAt.toISOString(),
    updatedAt: contract.updatedAt.toISOString(),
  };
}

@Injectable()
export class ContractService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validationService: ValidationService,
  ) {}

  async get(applicationId: string, customerId: string, role: AccessRole) {
    const application = await this.prisma.loanApplication.findUnique({
      where: { id: applicationId },
      select: { customerId: true },
    });

    if (!application) {
      throw new ApplicationNotFoundException();
    }
    if (role === "CUSTOMER" && application.customerId !== customerId) {
      throw new ForbiddenException();
    }

    const contract = await this.prisma.loanContract.findFirst({
      where: { applicationId },
      orderBy: { version: "desc" },
    });

    if (!contract) {
      throw new ContractNotFoundException();
    }

    return contractResponse(contract);
  }

  async create(applicationId: string, customerId: string) {
    return this.prisma.$transaction(
      async (transaction) => {
        const [lockedApplication] = await transaction.$queryRaw<LockedApplication[]>`
          SELECT id, customer_id AS "customerId", status
          FROM loan_applications
          WHERE id = ${applicationId}::uuid
          FOR UPDATE
        `;

        if (!lockedApplication) {
          throw new ApplicationNotFoundException();
        }
        if (lockedApplication.customerId !== customerId) {
          throw new ForbiddenException();
        }
        if (lockedApplication.status !== "DRAFT") {
          throw new ContractApplicationNotEditableException();
        }

        const evaluation = await this.validationService.evaluate(
          applicationId,
          customerId,
          transaction,
        );
        if (!evaluation.result.valid || !evaluation.product) {
          throw new ApplicationNotReadyException();
        }

        let schedule;
        try {
          schedule = buildContractSchedule(
            evaluation.application.requestedAmount,
            evaluation.application.termMonths,
            evaluation.product.annualInterestRate,
          );
        } catch (error) {
          if (error instanceof RangeError) {
            throw new DependencyUnavailableException();
          }
          throw error;
        }

        const latest = await transaction.loanContract.findFirst({
          where: { applicationId },
          orderBy: { version: "desc" },
          select: { version: true, contractNumber: true },
        });
        const version = (latest?.version ?? 0) + 1;
        const contractNumber =
          latest?.contractNumber ?? `CONTRACT-${evaluation.application.applicationNumber}`;
        const applicationSnapshot = {
          id: evaluation.application.id,
          applicationNumber: evaluation.application.applicationNumber,
          customerId: evaluation.application.customerId,
          productId: evaluation.application.productId,
          requestedAmount: schedule.totalPrincipal,
          termMonths: evaluation.application.termMonths,
          purpose: evaluation.application.purpose,
          applicantInfo: {
            fullName: evaluation.application.fullName,
            dateOfBirth: date(evaluation.application.dateOfBirth),
            identityNumber: evaluation.application.identityNumber,
            identityIssuedDate: date(evaluation.application.identityIssuedDate),
            email: evaluation.application.email,
            phone: evaluation.application.phone,
          },
          currentAddress: {
            addressLine: evaluation.application.addressLine,
            ward: evaluation.application.ward,
            district: evaluation.application.district,
            province: evaluation.application.province,
          },
          employmentInfo: {
            employmentType: evaluation.application.employmentType,
            employerName: evaluation.application.employerName,
            jobTitle: evaluation.application.jobTitle,
            employmentStartDate: date(evaluation.application.employmentStartDate),
          },
          financialInfo: {
            monthlyIncome: evaluation.application.monthlyIncome?.toString() ?? null,
            otherMonthlyIncome: evaluation.application.otherMonthlyIncome?.toString() ?? null,
          },
          contacts: evaluation.application.contacts.map((contact) => ({
            fullName: contact.fullName,
            relationship: contact.relationship,
            phone: contact.phone,
          })),
          documents: evaluation.application.documents
            .filter((document) => document.isCurrent)
            .map((document) => ({
              id: document.id,
              type: document.type,
              fileName: document.fileName,
              contentType: document.contentType,
              size: document.size,
              uploadedAt: document.uploadedAt.toISOString(),
            })),
          identityVerification: evaluation.application.identityVerifications[0]
            ? {
                id: evaluation.application.identityVerifications[0].id,
                status: evaluation.application.identityVerifications[0].status,
                verifiedAt:
                  evaluation.application.identityVerifications[0].verifiedAt.toISOString(),
              }
            : null,
          disbursementAccount: {
            accountNumber: evaluation.application.accountNumber,
            accountHolderName: evaluation.application.accountHolderName,
            verificationStatus: evaluation.application.verificationStatus,
          },
        };
        const productSnapshot = { ...evaluation.product };
        const contract = await transaction.loanContract.create({
          data: {
            applicationId,
            contractNumber,
            version,
            status: "DRAFT",
            principalAmount: evaluation.application.requestedAmount,
            currency: "VND",
            termMonths: evaluation.application.termMonths,
            annualInterestRate: evaluation.product.annualInterestRate,
            interestCalculationMethod: "DECLINING_BALANCE_EQUAL_PRINCIPAL",
            totalInterest: BigInt(schedule.totalInterest),
            totalPayable: BigInt(schedule.totalPayable),
            applicationSnapshot,
            productSnapshot,
            schedulePreview: schedule.items,
            signedAt: null,
            contentHash: null,
          },
        });

        return {
          created: version === 1,
          contract: contractResponse(contract, schedule.items),
        };
      },
      { timeout: 10_000 },
    );
  }
}
