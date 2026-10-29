import { Injectable } from "@nestjs/common";

import { ErrorCodes } from "../../common/constants/error-codes";
import { AppException, ApplicationNotFoundException } from "../../common/exceptions/app.exceptions";
import { contractResponse } from "../contract/contract.service";
import { applicationInclude, applicationResponse } from "../loan-applications/application.response";
import { LoanProductClient } from "../loan-applications/loan-product.client";
import { PrismaService } from "../prisma/prisma.service";
import type { ApplicationDecisionDto } from "./staff-loan-applications.dto";

@Injectable()
export class StaffLoanApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: LoanProductClient,
  ) {}

  async review(applicationId: string) {
    const application = await this.prisma.loanApplication.findUnique({
      where: { id: applicationId },
      include: {
        ...applicationInclude,
        contracts: { orderBy: { version: "desc" }, take: 1 },
      },
    });

    if (!application) {
      throw new ApplicationNotFoundException();
    }

    const contract = application.contracts[0];
    const productTerms = contract
      ? contract.productSnapshot
      : await this.products.getById(application.productId);

    // Staff manually assess the customer's ability to repay using declared income and the projected repayment schedule.
    return {
      application: applicationResponse(application),
      productTerms,
      contract: contract ? contractResponse(contract) : null,
    };
  }

  async decision(applicationId: string, status: ApplicationDecisionDto["status"]) {
    return this.prisma.$transaction(async (transaction) => {
      const [application] = await transaction.$queryRaw<{ status: string }[]>`
        SELECT status FROM loan_applications WHERE id = ${applicationId}::uuid FOR UPDATE
      `;

      if (!application) {
        throw new ApplicationNotFoundException();
      }

      if (application.status !== "SUBMITTED" && application.status !== status) {
        throw new AppException(
          409,
          ErrorCodes.APPLICATION_NOT_EDITABLE,
          "The loan application cannot be approved or rejected in its current status.",
        );
      }

      const result =
        application.status === status
          ? await transaction.loanApplication.findUniqueOrThrow({
              where: { id: applicationId },
              include: applicationInclude,
            })
          : await transaction.loanApplication.update({
              where: { id: applicationId },
              data: { status },
              include: applicationInclude,
            });

      return applicationResponse(result);
    });
  }
}
