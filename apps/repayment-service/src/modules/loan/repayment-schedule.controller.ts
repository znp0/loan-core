import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";

import { RoleGuard, RequireRoles, type AuthenticatedRequest } from "@repo/auth";
import { ApiFailureResponses } from "@repo/http";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { scheduleSchema } from "./loan.openapi";
import { RepaymentScheduleService } from "./repayment-schedule.service";

@ApiTags("Loans")
@ApiFailureResponses(500, 503)
@ApiCookieAuth("accessCookie")
@Controller("loans/:loanId/repayment-schedule")
@UseGuards(RoleGuard)
@RequireRoles("CUSTOMER", "STAFF")
export class RepaymentScheduleController {
  constructor(private readonly schedule: RepaymentScheduleService) {}

  @Get()
  @ApiOperation({
    summary: "Read the official repayment schedule",
    description:
      "Owner or STAFF. Installments are ordered by installmentNumber. Due dates use Asia/Ho_Chi_Minh calendar dates.",
  })
  @ApiResponse({ status: 200, schema: scheduleSchema })
  @ApiFailureResponses(400, 401, 403, 404)
  @ApiParam({ name: "loanId", format: "uuid" })
  get(
    @Param(
      "loanId",
      new ParseUUIDPipe({
        exceptionFactory: () =>
          new ValidationException([{ field: "loanId", message: "Loan ID must be a UUID." }]),
      }),
    )
    loanId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.schedule.get(loanId, request.user!);
  }
}
