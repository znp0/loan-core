import { Controller, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import {
  CustomerAccessGuard,
  type CustomerRequest,
} from "../../common/guards/customer-access.guard";
import { DisbursementAccountVerificationService } from "./disbursement-account-verification.service";

type AccountRequest = CustomerRequest & {
  headers: { "content-length"?: string; "transfer-encoding"?: string };
  query: Record<string, unknown>;
  body: unknown;
};

@Controller("loan-applications/:applicationId/disbursement-account")
@UseGuards(CustomerAccessGuard)
export class DisbursementAccountVerificationController {
  constructor(private readonly service: DisbursementAccountVerificationService) {}

  @Post("verify")
  @HttpCode(200)
  async verify(
    @Param(
      "applicationId",
      new ParseUUIDPipe({
        exceptionFactory: () =>
          new ValidationException([
            { field: "applicationId", message: "Application ID must be a UUID." },
          ]),
      }),
    )
    applicationId: string,
    @Req() request: AccountRequest,
  ) {
    if (Object.keys(request.query).length > 0) {
      throw new ValidationException([
        { field: "query", message: "Query parameters are not allowed." },
      ]);
    }

    const body = request.body;
    if (
      (request.headers["content-length"] !== undefined &&
        request.headers["content-length"] !== "0") ||
      request.headers["transfer-encoding"] !== undefined ||
      (body !== undefined &&
        (body === null ||
          typeof body !== "object" ||
          Array.isArray(body) ||
          Object.keys(body).length > 0))
    ) {
      throw new ValidationException([{ field: "body", message: "Request body must be empty." }]);
    }

    return this.service.verify(applicationId, request.customerId!);
  }
}
