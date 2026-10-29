import { Module } from "@nestjs/common";

import { AccessAuthModule } from "@repo/auth";

import { DisbursementController } from "./disbursement.controller";
import { DisbursementService } from "./disbursement.service";
import { DisbursementActionController } from "./disbursement-action.controller";
import { DisbursementActionService } from "./disbursement-action.service";
import { RepaymentLoanClient } from "./repayment-loan.client";
import { TransferProvider } from "./transfer.provider";

@Module({
  imports: [AccessAuthModule],
  controllers: [DisbursementController, DisbursementActionController],
  providers: [
    DisbursementService,
    DisbursementActionService,
    RepaymentLoanClient,
    TransferProvider,
  ],
})
export class DisbursementModule {}
