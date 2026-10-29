import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiSecurity, ApiTags } from "@nestjs/swagger";

import { InternalTokenGuard, RequireInternalToken } from "@repo/auth";
import { ApiFailureResponses, jsonObject } from "@repo/http";

import { ActiveLoanService } from "./active-loan.service";

@ApiTags("Internal eligibility")
@ApiFailureResponses(500, 503)
@ApiSecurity("internalToken")
@Controller("internal/customers")
@UseGuards(InternalTokenGuard)
@RequireInternalToken("REPAYMENT_INTERNAL_TOKEN")
export class ActiveLoanController {
  constructor(private readonly activeLoanService: ActiveLoanService) {}

  @Get(":customerId/active-loan")
  @ApiOperation({
    summary: "Check for an unpaid loan",
    description:
      "Uses REPAYMENT_INTERNAL_TOKEN. ACTIVE and OVERDUE loans block new borrowing; CLOSED loans do not.",
  })
  @ApiResponse({ status: 200, schema: jsonObject({ hasActiveLoan: { type: "boolean" } }) })
  @ApiFailureResponses(400, 401)
  @ApiParam({ name: "customerId", format: "uuid" })
  async getActiveLoan(
    @Param("customerId", new ParseUUIDPipe()) customerId: string,
  ): Promise<{ hasActiveLoan: boolean }> {
    const hasActiveLoan = await this.activeLoanService.hasActiveLoan(customerId);

    return { hasActiveLoan };
  }
}
