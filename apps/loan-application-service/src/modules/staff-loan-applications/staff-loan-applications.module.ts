import { Module } from "@nestjs/common";

import { AccessAuthModule } from "@repo/auth";

import { LoanProductClient } from "../loan-applications/loan-product.client";
import { StaffLoanApplicationsController } from "./staff-loan-applications.controller";
import { StaffLoanApplicationsService } from "./staff-loan-applications.service";

@Module({
  imports: [AccessAuthModule],
  controllers: [StaffLoanApplicationsController],
  providers: [StaffLoanApplicationsService, LoanProductClient],
})
export class StaffLoanApplicationsModule {}
