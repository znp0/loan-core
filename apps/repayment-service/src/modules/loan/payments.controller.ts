import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";

import { RequireRoles, RoleGuard, type AuthenticatedRequest } from "@repo/auth";
import { RequestValidationPipe } from "@repo/http";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { CreatePaymentDto, PaymentHistoryDto } from "./payment.dto";
import { PaymentsService } from "./payments.service";

@Controller("loans/:loanId")
@UseGuards(RoleGuard)
@RequireRoles("CUSTOMER", "STAFF")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  get(@Param("loanId", new ParseUUIDPipe()) loanId: string, @Req() request: AuthenticatedRequest) {
    return this.payments.get(loanId, request.user!);
  }

  @Get("payments")
  @UsePipes(new RequestValidationPipe())
  history(
    @Param("loanId", new ParseUUIDPipe()) loanId: string,
    @Req() request: AuthenticatedRequest,
    @Query() query: PaymentHistoryDto,
  ) {
    return this.payments.history(loanId, request.user!, query);
  }

  @Post("payments")
  @HttpCode(200)
  @RequireRoles("CUSTOMER")
  @UsePipes(new RequestValidationPipe())
  pay(
    @Param("loanId", new ParseUUIDPipe()) loanId: string,
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") key: string | undefined,
    @Body() input: CreatePaymentDto,
  ) {
    if (!key || !/^[A-Za-z0-9._:-]{1,128}$/.test(key)) {
      throw new ValidationException([
        {
          field: "Idempotency-Key",
          message: "Provide 1–128 letters, digits, dots, underscores, colons or hyphens.",
        },
      ]);
    }

    return this.payments.pay(loanId, request.user!.id, input, key);
  }
}
