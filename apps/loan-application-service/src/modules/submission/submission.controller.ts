import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";

import { RequireRoles, RoleGuard, type AuthenticatedRequest } from "@repo/auth";
import { ApiFailureResponses, RequestValidationPipe } from "@repo/http";

import { submissionSchema } from "../../common/api.schemas";
import { ValidationException } from "../../common/exceptions/app.exceptions";
import { SubmissionDto } from "./submission.dto";
import { SubmissionService } from "./submission.service";

@ApiTags("Submission")
@ApiFailureResponses(500, 503)
@ApiCookieAuth("accessCookie")
@Controller("loan-applications/:applicationId/submit")
@UseGuards(RoleGuard)
@RequireRoles("CUSTOMER")
@UsePipes(new RequestValidationPipe())
export class SubmissionController {
  constructor(private readonly submissionService: SubmissionService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: "Sign and submit the application",
    description:
      "CUSTOMER owner, DRAFT only. Confirm the current contract version with confirm=true. Revalidates readiness and snapshot content, then signs the contract and submits the application in one transaction.",
  })
  @ApiResponse({ status: 200, schema: submissionSchema })
  @ApiFailureResponses(400, 401, 403, 404, 409, 422)
  @ApiParam({ name: "applicationId", format: "uuid" })
  submit(
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
    @Body() input: SubmissionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.submissionService.submit(applicationId, request.user!.id, input.contractVersion);
  }
}
