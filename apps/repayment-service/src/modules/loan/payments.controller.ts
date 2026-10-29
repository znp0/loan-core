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
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";

import { RequireRoles, RoleGuard, type AuthenticatedRequest } from "@repo/auth";
import { ApiFailureResponses, ApiIdempotencyKey, RequestValidationPipe } from "@repo/http";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { historySchema, loanSchema, paymentSchema } from "./loan.openapi";
import { CreatePaymentDto, PaymentHistoryDto } from "./payment.dto";
import { PaymentsService } from "./payments.service";

@ApiTags("Loans and payments")
@ApiFailureResponses(500, 503)
@ApiCookieAuth("accessCookie")
@Controller("loans/:loanId")
@UseGuards(RoleGuard)
@RequireRoles("CUSTOMER", "STAFF")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @ApiOperation({
    summary: "Read loan balances and closure",
    description: "Owner or STAFF. Outstanding balances include principal and interest.",
  })
  @ApiResponse({ status: 200, schema: loanSchema })
  @ApiFailureResponses(400, 401, 403, 404)
  @ApiParam({ name: "loanId", format: "uuid" })
  get(@Param("loanId", new ParseUUIDPipe()) loanId: string, @Req() request: AuthenticatedRequest) {
    return this.payments.get(loanId, request.user!);
  }

  @Get("payments")
  @UsePipes(new RequestValidationPipe())
  @ApiOperation({
    summary: "Read payment history",
    description:
      "Owner or STAFF. One-based pagination defaults to page=1 and limit=20 (maximum 100).",
  })
  @ApiResponse({ status: 200, schema: historySchema })
  @ApiFailureResponses(400, 401, 403, 404)
  @ApiParam({ name: "loanId", format: "uuid" })
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
  @ApiOperation({
    summary: "Pay a due installment",
    description:
      "CUSTOMER owner only. Pay the full outstanding amount of the earliest unpaid installment, only when due in Asia/Ho_Chi_Minh. A matching retry replays the original payment even after closure. The final payment closes the loan atomically. Errors include PAYMENT_AMOUNT_MISMATCH (400), INSTALLMENT_NOT_PAYABLE, INSTALLMENT_NOT_DUE, LOAN_CLOSED and IDEMPOTENCY_CONFLICT (409).",
  })
  @ApiResponse({ status: 200, schema: paymentSchema })
  @ApiFailureResponses(400, 401, 403, 404, 409)
  @ApiParam({ name: "loanId", format: "uuid" })
  @ApiIdempotencyKey()
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
