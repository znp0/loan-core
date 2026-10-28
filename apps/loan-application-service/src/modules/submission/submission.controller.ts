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

import { RequestValidationPipe } from "@repo/http";
import { RequireRoles, RoleGuard, type AuthenticatedRequest } from "@repo/auth";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { SubmissionDto } from "./submission.dto";
import { SubmissionService } from "./submission.service";

@Controller("loan-applications/:applicationId/submit")
@UseGuards(RoleGuard)
@RequireRoles("CUSTOMER")
@UsePipes(new RequestValidationPipe())
export class SubmissionController {
  constructor(private readonly submissionService: SubmissionService) {}

  @Post()
  @HttpCode(200)
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
