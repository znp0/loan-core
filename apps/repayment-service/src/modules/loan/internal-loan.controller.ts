import { Body, Controller, HttpCode, Post, UseGuards, UsePipes } from "@nestjs/common";

import { InternalTokenGuard, RequireInternalToken } from "@repo/auth";
import { RequestValidationPipe } from "@repo/http";

import { CreateLoanDto } from "./create-loan.dto";
import { LoanCreationService } from "./loan-creation.service";

@Controller("internal/loans")
@UseGuards(InternalTokenGuard)
@RequireInternalToken("REPAYMENT_INTERNAL_TOKEN")
export class InternalLoanController {
  constructor(private readonly loans: LoanCreationService) {}

  @Post()
  @HttpCode(200)
  @UsePipes(new RequestValidationPipe())
  create(@Body() input: CreateLoanDto) {
    return this.loans.create(input);
  }
}
