import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags, ApiParam } from "@nestjs/swagger";

import { RequireRoles, RoleGuard, type AuthenticatedRequest } from "@repo/auth";
import { ApiFailureResponses, RequestValidationPipe } from "@repo/http";

import { identityVerificationSchema } from "../../common/api.schemas";
import { ValidationException } from "../../common/exceptions/app.exceptions";
import { IdentityVerificationDto } from "./identity-verification.dto";
import { IdentityVerificationService } from "./identity-verification.service";

@ApiTags("Verification")
@ApiFailureResponses(500, 503)
@ApiCookieAuth("accessCookie")
@Controller("loan-applications/:applicationId/identity-verifications")
@UseGuards(RoleGuard)
@RequireRoles("CUSTOMER")
@UsePipes(new RequestValidationPipe())
export class IdentityVerificationController {
  constructor(private readonly identityVerificationService: IdentityVerificationService) {}

  @Post()
  @ApiOperation({
    summary: "Verify applicant identity",
    description:
      "CUSTOMER owner, DRAFT only. Compares supplied identity details with saved application values and records PASSED or FAILED without returning identity values.",
  })
  @ApiResponse({ status: 201, schema: identityVerificationSchema })
  @ApiParam({ name: "applicationId", format: "uuid" })
  @ApiFailureResponses(400, 401, 403, 404, 409)
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
    @Body() input: IdentityVerificationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.identityVerificationService.verify(applicationId, request.user!.id, input);
  }
}
