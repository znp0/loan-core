import { Module } from "@nestjs/common";

import { RoleGuardModule } from "../../common/guards/role-guard.module";
import { DisbursementAccountVerificationController } from "./disbursement-account-verification.controller";
import { DisbursementAccountVerificationService } from "./disbursement-account-verification.service";

@Module({
  imports: [RoleGuardModule],
  controllers: [DisbursementAccountVerificationController],
  providers: [DisbursementAccountVerificationService],
})
export class DisbursementAccountVerificationModule {}
