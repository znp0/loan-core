import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/exceptions/app.exceptions";
import type { Prisma } from "../../generated/prisma/client";
import { RepaymentEligibilityClient } from "../repayment-eligibility/repayment-eligibility.client";

@Injectable()
export class ApplicationEligibilityPolicy {
  constructor(private readonly repayment: RepaymentEligibilityClient) {}

  async assertNoActiveLoan(customerId: string): Promise<void> {
    if (await this.repayment.hasActiveLoan(customerId)) {
      throw new AppException(409, "ACTIVE_LOAN_EXISTS", "The customer already has an unpaid loan.");
    }
  }

  async assertNoActiveApplication(tx: Prisma.TransactionClient, customerId: string): Promise<void> {
    const activeApplication = await tx.loanApplication.findFirst({
      where: { customerId, status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } },
      select: { id: true },
    });

    if (activeApplication) {
      throw activeApplicationExistsException();
    }
  }
}

export function activeApplicationExistsException(): AppException {
  return new AppException(
    409,
    "ACTIVE_APPLICATION_EXISTS",
    "An active loan application already exists for this customer.",
  );
}
