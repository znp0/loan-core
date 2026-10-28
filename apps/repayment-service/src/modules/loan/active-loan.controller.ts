import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";

import { InternalTokenGuard, RequireInternalToken } from "@repo/auth";

import { ActiveLoanService } from "./active-loan.service";

@Controller("internal/customers")
@UseGuards(InternalTokenGuard)
@RequireInternalToken("REPAYMENT_INTERNAL_TOKEN")
export class ActiveLoanController {
  constructor(private readonly activeLoanService: ActiveLoanService) {}

  @Get(":customerId/active-loan")
  async getActiveLoan(
    @Param("customerId", new ParseUUIDPipe()) customerId: string,
  ): Promise<{ hasActiveLoan: boolean }> {
    const hasActiveLoan = await this.activeLoanService.hasActiveLoan(customerId);

    return { hasActiveLoan };
  }
}
