import { Module } from "@nestjs/common";

import { RoleGuardModule } from "../../common/guards/role-guard.module";
import { DisbursementController } from "./disbursement.controller";
import { DisbursementService } from "./disbursement.service";

@Module({
  imports: [RoleGuardModule],
  controllers: [DisbursementController],
  providers: [DisbursementService],
})
export class DisbursementModule {}
