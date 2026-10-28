import { Module } from "@nestjs/common";

import { HttpModule } from "@repo/http";

import { HealthController } from "./health/health.controller";
import { ContractModule } from "./modules/contract/contract.module";
import { DisbursementModule } from "./modules/disbursement/disbursement.module";
import { DisbursementAccountVerificationModule } from "./modules/disbursement-account-verification/disbursement-account-verification.module";
import { IdentityVerificationModule } from "./modules/identity-verification/identity-verification.module";
import { LoanApplicationsModule } from "./modules/loan-applications/loan-applications.module";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { StaffLoanApplicationsModule } from "./modules/staff-loan-applications/staff-loan-applications.module";
import { ValidationModule } from "./modules/validation/validation.module";
import { SubmissionModule } from "./modules/submission/submission.module";

@Module({
  imports: [
    HttpModule,
    PrismaModule,
    LoanApplicationsModule,
    ContractModule,
    DisbursementModule,
    IdentityVerificationModule,
    DisbursementAccountVerificationModule,
    ValidationModule,
    SubmissionModule,
    StaffLoanApplicationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
