import { Injectable } from "@nestjs/common";

import {
  AccountInformationIncompleteException,
  AccountVerificationNotEditableException,
  ApplicationNotFoundException,
  ForbiddenException,
} from "../../common/exceptions/app.exceptions";
import { PrismaService } from "../prisma/prisma.service";

function normalizeName(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLocaleLowerCase("vi");
}

@Injectable()
export class DisbursementAccountVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(applicationId: string, customerId: string) {
    const application = await this.prisma.loanApplication.findUnique({
      where: { id: applicationId },
      select: {
        customerId: true,
        status: true,
        accountNumber: true,
        accountHolderName: true,
        fullName: true,
      },
    });

    if (!application) {
      throw new ApplicationNotFoundException();
    }
    if (application.customerId !== customerId) {
      throw new ForbiddenException();
    }
    if (application.status !== "DRAFT") {
      throw new AccountVerificationNotEditableException();
    }

    const accountNumber = application.accountNumber?.trim();
    const accountHolderName = application.accountHolderName?.trim();
    if (!accountNumber || !accountHolderName) {
      throw new AccountInformationIncompleteException();
    }

    const mismatchedFields: string[] = [];
    if (!/^\d{6,20}$/.test(accountNumber)) {
      mismatchedFields.push("accountNumber");
    }
    if (
      !application.fullName ||
      normalizeName(accountHolderName) !== normalizeName(application.fullName)
    ) {
      mismatchedFields.push("accountHolderName");
    }

    const status = mismatchedFields.length === 0 ? "VERIFIED" : "FAILED";
    await this.prisma.loanApplication.update({
      where: { id: applicationId },
      data: { verificationStatus: status, updatedAt: new Date() },
    });

    return {
      status,
      maskedAccountNumber: accountNumber.length > 4 ? `******${accountNumber.slice(-4)}` : "******",
      accountHolderName,
      mismatchedFields,
      verifiedAt: new Date().toISOString(),
    };
  }
}
