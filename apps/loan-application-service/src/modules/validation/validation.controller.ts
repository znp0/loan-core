import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from "@nestjs/common";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { RequireRoles, RoleGuard, type AuthenticatedRequest } from "../../common/guards/role.guard";
import { ValidationService } from "./validation.service";

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
    @Req() request: AuthenticatedRequest,
  ) {
    return this.validationService.validate(applicationId, request.user!.id);
  }
}
