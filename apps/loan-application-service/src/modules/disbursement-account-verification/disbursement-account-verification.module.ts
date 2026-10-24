import { Module } from "@nestjs/common";

import { CustomerAccessModule } from "../../common/guards/customer-access.module";
import { DisbursementAccountVerificationController } from "./disbursement-account-verification.controller";
import { DisbursementAccountVerificationService } from "./disbursement-account-verification.service";

@Module({
  imports: [CustomerAccessModule],
  controllers: [DisbursementAccountVerificationController],
  providers: [DisbursementAccountVerificationService],
})
export class DisbursementAccountVerificationModule {}
