import { Module } from "@nestjs/common";

import { AccessAuthModule } from "@repo/auth";

import { DisbursementController } from "./disbursement.controller";
import { DisbursementService } from "./disbursement.service";

@Module({
  imports: [AccessAuthModule],
  controllers: [DisbursementController],
  providers: [DisbursementService],
})
export class DisbursementModule {}
