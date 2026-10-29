import { Body, Controller, HttpCode, Post, UseGuards, UsePipes } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from "@nestjs/swagger";

import { InternalTokenGuard, RequireInternalToken } from "@repo/auth";
import { ApiFailureResponses, RequestValidationPipe } from "@repo/http";

import { CreateLoanDto } from "./create-loan.dto";
import { LoanCreationService } from "./loan-creation.service";
import { createdLoanSchema } from "./loan.openapi";

@ApiTags("Internal loans")
@ApiFailureResponses(500, 503)
@ApiSecurity("internalToken")
@Controller("internal/loans")
@UseGuards(InternalTokenGuard)
@RequireInternalToken("REPAYMENT_INTERNAL_TOKEN")
export class InternalLoanController {
  constructor(private readonly loans: LoanCreationService) {}

  @Post()
  @HttpCode(200)
  @UsePipes(new RequestValidationPipe())
  @ApiOperation({
    summary: "Create or retrieve a loan",
    description:
      "Uses REPAYMENT_INTERNAL_TOKEN. applicationId identifies matching retries; conflicting terms return 409. Atomically creates installments from the signed schedule. Due dates use the transfer date in Asia/Ho_Chi_Minh, one month later, clamped to month end while retaining the original day for later months.",
  })
  @ApiResponse({ status: 200, schema: createdLoanSchema })
  @ApiFailureResponses(400, 401, 409)
  create(@Body() input: CreateLoanDto) {
    return this.loans.create(input);
  }
}
