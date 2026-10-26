import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from "@nestjs/common";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { RequireRoles, RoleGuard, type CustomerRequest } from "../../common/guards/role.guard";
import { ValidationService } from "./validation.service";

type ValidationRequest = CustomerRequest & {
  headers: { "content-length"?: string; "transfer-encoding"?: string };
  query: Record<string, unknown>;
  body: unknown;
};

@Controller("loan-applications/:applicationId/validation")
@UseGuards(RoleGuard)
@RequireRoles("CUSTOMER")
export class ValidationController {
  constructor(private readonly validationService: ValidationService) {}

  @Get()
  async get(
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
    @Req() request: ValidationRequest,
  ) {
    if (Object.keys(request.query).length > 0) {
      throw new ValidationException([
        { field: "query", message: "Query parameters are not allowed." },
      ]);
    }
    if (
      (request.headers["content-length"] !== undefined &&
        request.headers["content-length"] !== "0") ||
      request.headers["transfer-encoding"] !== undefined ||
      (request.body !== undefined &&
        (request.body === null ||
          typeof request.body !== "object" ||
          Object.keys(request.body).length > 0))
    ) {
      throw new ValidationException([{ field: "body", message: "Request body must be empty." }]);
    }
    return this.validationService.validate(applicationId, request.customerId!);
  }
}
