import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";

import { RequireRoles, RoleGuard } from "@repo/auth";
import { ApiFailureResponses, RequestValidationPipe } from "@repo/http";

import { applicationSchema, reviewSchema } from "../../common/api.schemas";
import { ValidationException } from "../../common/exceptions/app.exceptions";
import { ApplicationDecisionDto } from "./staff-loan-applications.dto";
import { StaffLoanApplicationsService } from "./staff-loan-applications.service";

@ApiTags("Staff applications")
@ApiFailureResponses(500, 503)
@ApiCookieAuth("accessCookie")
@Controller("staff/loan-applications")
@UseGuards(RoleGuard)
@RequireRoles("STAFF")
export class StaffLoanApplicationsController {
  constructor(private readonly applications: StaffLoanApplicationsService) {}

  @Get(":applicationId/review")
  @ApiOperation({
    summary: "Review an application",
    description:
      "STAFF. Includes declared income, contract schedule and product terms for manual affordability assessment.",
  })
  @ApiResponse({ status: 200, schema: reviewSchema })
  @ApiFailureResponses(400, 401, 403, 404)
  @ApiParam({ name: "applicationId", format: "uuid" })
  review(
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
  ) {
    return this.applications.review(applicationId);
  }

  @Post(":applicationId/decision")
  @HttpCode(200)
  @UsePipes(new RequestValidationPipe())
  @ApiOperation({
    summary: "Approve or reject a submitted application",
    description:
      "STAFF. Accepts APPROVED or REJECTED from SUBMITTED. Repeating the same decision returns the current application; an incompatible state returns 409.",
  })
  @ApiResponse({ status: 200, schema: applicationSchema })
  @ApiFailureResponses(400, 401, 403, 404, 409)
  @ApiParam({ name: "applicationId", format: "uuid" })
  decision(
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
    @Body() input: ApplicationDecisionDto,
  ) {
    return this.applications.decision(applicationId, input.status);
  }
}
