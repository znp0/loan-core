import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from "@nestjs/common";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { RoleGuard, type AuthenticatedRequest } from "../../common/guards/role.guard";
import { RepaymentScheduleService } from "./repayment-schedule.service";

@Controller("loans/:loanId/repayment-schedule")
@UseGuards(RoleGuard)
export class RepaymentScheduleController {
  constructor(private readonly schedule: RepaymentScheduleService) {}

  @Get()
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
