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

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { RequireRoles, RoleGuard, type CustomerRequest } from "../../common/guards/role.guard";
import { RequestValidationPipe } from "../../common/pipes/request-validation.pipe";
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
    @Req() request: CustomerRequest & { query: Record<string, unknown> },
  ) {
    if (Object.keys(request.query).length > 0) {
      throw new ValidationException([
        { field: "query", message: "Query parameters are not allowed." },
      ]);
    }

    return this.submissionService.submit(applicationId, request.customerId!, input.contractVersion);
  }
}
