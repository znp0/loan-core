import { Module } from "@nestjs/common";

import { RoleGuardModule } from "../../common/guards/role-guard.module";
import { LoanProductClient } from "../loan-applications/loan-product.client";
import { StaffLoanApplicationsController } from "./staff-loan-applications.controller";
import { StaffLoanApplicationsService } from "./staff-loan-applications.service";

@Module({
  imports: [RoleGuardModule],
  controllers: [StaffLoanApplicationsController],
  providers: [StaffLoanApplicationsService, LoanProductClient],
})
export class StaffLoanApplicationsModule {}
