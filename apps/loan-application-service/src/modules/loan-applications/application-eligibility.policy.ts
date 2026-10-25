import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/exceptions/app.exceptions";
import type { Prisma } from "../../generated/prisma/client";

@Injectable()
export class ApplicationEligibilityPolicy {
  async assertAvailable(tx: Prisma.TransactionClient, customerId: string): Promise<void> {
    const existing = await tx.loanApplication.findFirst({
      where: { customerId, status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } },
      select: { id: true },
    });
    if (existing) throw activeApplicationExists();
  }
}

export function activeApplicationExists(): AppException {
  return new AppException(
    409,
    "ACTIVE_APPLICATION_EXISTS",
    "An active loan application already exists for this customer.",
  );
}
