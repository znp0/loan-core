import { Module } from "@nestjs/common";

import { AccessAuthModule } from "@repo/auth";

import { PrismaModule } from "../prisma/prisma.module";
import { RepaymentEligibilityModule } from "../repayment-eligibility/repayment-eligibility.module";
import { ApplicationEligibilityPolicy } from "./application-eligibility.policy";
import { DocumentStorage } from "./document.storage";
import { LoanProductClient } from "./loan-product.client";
import { LoanApplicationsController } from "./loan-applications.controller";
import { LoanApplicationsService } from "./loan-applications.service";

@Module({
  imports: [PrismaModule, AccessAuthModule, RepaymentEligibilityModule],
  controllers: [LoanApplicationsController],
  providers: [
    LoanApplicationsService,
    LoanProductClient,
    DocumentStorage,
    ApplicationEligibilityPolicy,
  ],
})
export class LoanApplicationsModule {}
