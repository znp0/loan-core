import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";

import { RepaymentInternalTokenGuard } from "../../common/guards/repayment-internal-token.guard";
import { ActiveLoanService } from "./active-loan.service";

@Controller("internal/customers")
@UseGuards(RepaymentInternalTokenGuard)
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
