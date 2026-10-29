import { Module } from "@nestjs/common";

import { AccessAuthModule } from "@repo/auth";

import { RepaymentEligibilityModule } from "../repayment-eligibility/repayment-eligibility.module";

import { ValidationController } from "./validation.controller";
import { ValidationService } from "./validation.service";

@Module({
  imports: [AccessAuthModule, RepaymentEligibilityModule],
  controllers: [ValidationController],
  providers: [ValidationService],
  exports: [ValidationService],
})
export class ValidationModule {}
