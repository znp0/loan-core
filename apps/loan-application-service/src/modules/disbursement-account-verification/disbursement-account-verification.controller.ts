import { Controller, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";

import { RoleGuard, type AuthenticatedRequest, RequireRoles } from "@repo/auth";
import { ApiFailureResponses } from "@repo/http";

import { accountVerificationSchema } from "../../common/api.schemas";
import { ValidationException } from "../../common/exceptions/app.exceptions";
import { DisbursementAccountVerificationService } from "./disbursement-account-verification.service";

@ApiTags("Verification")
@ApiFailureResponses(500, 503)
@ApiCookieAuth("accessCookie")
@Controller("loan-applications/:applicationId/disbursement-account")
@UseGuards(RoleGuard)
@RequireRoles("CUSTOMER")
export class DisbursementAccountVerificationController {
  constructor(private readonly service: DisbursementAccountVerificationService) {}

  @Post("verify")
  @HttpCode(200)
  @ApiOperation({
    summary: "Verify the saved disbursement account",
    description:
      "CUSTOMER owner, DRAFT only. Checks saved account number and holder name against the borrower. Unused bodies and query parameters are ignored. Incomplete saved account details return 422.",
  })
  @ApiResponse({ status: 200, schema: accountVerificationSchema })
  @ApiFailureResponses(400, 401, 403, 404, 409, 422)
  @ApiParam({ name: "applicationId", format: "uuid" })
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
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.verify(applicationId, request.user!.id);
  }
}
