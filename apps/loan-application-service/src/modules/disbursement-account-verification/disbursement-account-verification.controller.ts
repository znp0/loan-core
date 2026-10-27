import { Controller, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { RoleGuard, type AuthenticatedRequest, RequireRoles } from "../../common/guards/role.guard";
import { DisbursementAccountVerificationService } from "./disbursement-account-verification.service";

@Controller("loan-applications/:applicationId/disbursement-account")
@UseGuards(RoleGuard)
@RequireRoles("CUSTOMER")
export class DisbursementAccountVerificationController {
  constructor(private readonly service: DisbursementAccountVerificationService) {}

  @Post("verify")
  @HttpCode(200)
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
