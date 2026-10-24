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
    const application = await this.prisma.loan_applications.findUnique({
      where: { id: applicationId },
      select: {
        customer_id: true,
        status: true,
        bank_code: true,
        account_number: true,
        account_holder_name: true,
        full_name: true,
      },
    });

    if (!application) {
      throw new ApplicationNotFoundException();
    }
    if (application.customer_id !== customerId) {
      throw new ForbiddenException();
    }
    if (application.status !== "DRAFT") {
      throw new AccountVerificationNotEditableException();
    }

    const bankCode = application.bank_code?.trim();
    const accountNumber = application.account_number?.trim();
    const accountHolderName = application.account_holder_name?.trim();
    if (!bankCode || !accountNumber || !accountHolderName) {
      throw new AccountInformationIncompleteException();
    }

    const mismatchedFields: string[] = [];
    if (!/^[A-Za-z0-9]{2,20}$/.test(bankCode)) {
      mismatchedFields.push("bankCode");
    }
    if (!/^\d{6,20}$/.test(accountNumber)) {
      mismatchedFields.push("accountNumber");
    }
    if (
      !application.full_name ||
      normalizeName(accountHolderName) !== normalizeName(application.full_name)
    ) {
      mismatchedFields.push("accountHolderName");
    }

    const status = mismatchedFields.length === 0 ? "VERIFIED" : "FAILED";
    await this.prisma.loan_applications.update({
      where: { id: applicationId },
      data: { verification_status: status, updated_at: new Date() },
    });

    return {
      status,
      bankCode,
      maskedAccountNumber: accountNumber.length > 4 ? `******${accountNumber.slice(-4)}` : "******",
      accountHolderName,
      mismatchedFields,
      verifiedAt: new Date().toISOString(),
    };
  }
}
