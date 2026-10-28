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

import { RequestValidationPipe } from "@repo/http";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { RequireRoles, RoleGuard } from "../../common/guards/role.guard";
import { ApplicationDecisionDto } from "./staff-loan-applications.dto";
import { StaffLoanApplicationsService } from "./staff-loan-applications.service";

@Controller("staff/loan-applications")
@UseGuards(RoleGuard)
@RequireRoles("STAFF")
export class StaffLoanApplicationsController {
  constructor(private readonly applications: StaffLoanApplicationsService) {}

  @Get(":applicationId/review")
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
