import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";

import { RequireRoles, RoleGuard, type AuthenticatedRequest } from "@repo/auth";
import { ApiFailureResponses } from "@repo/http";

import { disbursementSchema } from "../../common/api.schemas";
import { ValidationException } from "../../common/exceptions/app.exceptions";
import { DisbursementService } from "./disbursement.service";

@ApiTags("Disbursement")
@ApiFailureResponses(500, 503)
@ApiCookieAuth("accessCookie")
@Controller("loan-applications/:applicationId/disbursement")
@UseGuards(RoleGuard)
@RequireRoles("CUSTOMER", "STAFF")
export class DisbursementController {
  constructor(private readonly disbursementService: DisbursementService) {}

  @Get()
  @ApiOperation({
    summary: "Read disbursement and attempts",
    description:
      "CUSTOMER owner or STAFF. Account numbers are masked. loanId is published only for SUCCEEDED.",
  })
  @ApiResponse({ status: 200, schema: disbursementSchema })
  @ApiFailureResponses(400, 401, 403, 404)
  @ApiParam({ name: "applicationId", format: "uuid" })
  get(
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
    return this.disbursementService.get(applicationId, request.user!.id, request.user!.role);
  }
}
