import { Injectable } from "@nestjs/common";

import {
  ApplicationNotFoundException,
  DisbursementNotFoundException,
  ForbiddenException,
} from "../../common/exceptions/app.exceptions";
import type { AccessRole } from "@repo/auth";

import { PrismaService } from "../prisma/prisma.service";

const VISIBLE_ACCOUNT_NUMBER_DIGITS = 4;

@Injectable()
export class DisbursementService {
  constructor(private readonly prisma: PrismaService) {}

  async get(applicationId: string, userId: string, role: AccessRole) {
    const application = await this.prisma.loanApplication.findUnique({
      where: { id: applicationId },
      select: { customerId: true },
    });

    if (!application) {
      throw new ApplicationNotFoundException();
    }

    if (role === "CUSTOMER" && application.customerId !== userId) {
      throw new ForbiddenException();
    }

    const disbursement = await this.prisma.$transaction(
      (transaction) =>
        transaction.disbursement.findUnique({
          where: { applicationId },
          include: { attempts: { orderBy: { attemptNumber: "asc" } } },
        }),
      { isolationLevel: "RepeatableRead" },
    );

    if (!disbursement) {
      throw new DisbursementNotFoundException();
    }

    const amount = Number(disbursement.amount);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new RangeError("Disbursement amount is outside the supported integer range.");
    }

    const account = disbursement.accountNumber;
    const maskedAccountNumber =
      account.length <= VISIBLE_ACCOUNT_NUMBER_DIGITS
        ? "*".repeat(account.length)
        : `${"*".repeat(account.length - VISIBLE_ACCOUNT_NUMBER_DIGITS)}${account.slice(-VISIBLE_ACCOUNT_NUMBER_DIGITS)}`;

    return {
      id: disbursement.id,
      applicationId: disbursement.applicationId,
      amount,
      currency: disbursement.currency,
      destinationAccount: {
        maskedAccountNumber,
        accountHolderName: disbursement.accountHolderName,
      },
      status: disbursement.status,
      attempts: disbursement.attempts.map((attempt) => ({
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        transactionReference: attempt.transactionReference,
        failureCode: attempt.failureCode,
        failureMessage: attempt.failureMessage,
        processedAt: attempt.processedAt.toISOString(),
      })),
      loanId: disbursement.status === "SUCCEEDED" ? disbursement.loanId : null,
      createdAt: disbursement.createdAt.toISOString(),
      completedAt: disbursement.completedAt?.toISOString() ?? null,
    };
  }
}
