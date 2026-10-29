import { Module } from "@nestjs/common";

import { RepaymentEligibilityClient } from "./repayment-eligibility.client";

@Module({
  providers: [RepaymentEligibilityClient],
  exports: [RepaymentEligibilityClient],
})
export class RepaymentEligibilityModule {}
