import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/exceptions/app.exceptions";
import type { Prisma } from "../../generated/prisma/client";

@Injectable()
export class ApplicationEligibilityPolicy {
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
