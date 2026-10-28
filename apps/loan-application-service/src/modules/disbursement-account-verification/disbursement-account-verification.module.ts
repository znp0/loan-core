import { Module } from "@nestjs/common";

import { AccessAuthModule } from "@repo/auth";

import { DisbursementAccountVerificationController } from "./disbursement-account-verification.controller";
import { DisbursementAccountVerificationService } from "./disbursement-account-verification.service";

@Module({
  imports: [AccessAuthModule],
  controllers: [DisbursementAccountVerificationController],
  providers: [DisbursementAccountVerificationService],
})
export class DisbursementAccountVerificationModule {}
