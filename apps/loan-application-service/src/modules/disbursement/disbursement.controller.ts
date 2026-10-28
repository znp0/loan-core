import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from "@nestjs/common";

import { RequireRoles, RoleGuard, type AuthenticatedRequest } from "@repo/auth";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { DisbursementService } from "./disbursement.service";

@Controller("loan-applications/:applicationId/disbursement")
@UseGuards(RoleGuard)
@RequireRoles("CUSTOMER", "STAFF")
export class DisbursementController {
  constructor(private readonly disbursementService: DisbursementService) {}

  @Get()
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
