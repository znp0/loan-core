import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";

import { RequireRoles, RoleGuard, type AuthenticatedRequest } from "@repo/auth";
import { ApiFailureResponses } from "@repo/http";

import { readinessSchema } from "../../common/api.schemas";
import { ValidationException } from "../../common/exceptions/app.exceptions";
import { ValidationService } from "./validation.service";

@ApiTags("Readiness")
@ApiFailureResponses(500, 503)
@ApiCookieAuth("accessCookie")
@Controller("loan-applications/:applicationId/validation")
@UseGuards(RoleGuard)
@RequireRoles("CUSTOMER")
export class ValidationController {
  constructor(private readonly validationService: ValidationService) {}

  @Get()
  @ApiOperation({
    summary: "Check application readiness",
    description:
      "CUSTOMER owner. Reports document, identity, account, product, age, income and active borrowing checks. IDs remain valid throughout their expiry date in Asia/Ho_Chi_Minh. This does not approve affordability; staff assess it manually.",
  })
  @ApiResponse({ status: 200, schema: readinessSchema })
  @ApiFailureResponses(400, 401, 403, 404)
  @ApiParam({ name: "applicationId", format: "uuid" })
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
    @Req() request: AuthenticatedRequest,
  ) {
    return this.validationService.validate(applicationId, request.user!.id);
  }
}
