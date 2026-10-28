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

import { RequestValidationPipe } from "@repo/http";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { RequireRoles, RoleGuard, type AuthenticatedRequest } from "../../common/guards/role.guard";
import { IdentityVerificationDto } from "./identity-verification.dto";
import { IdentityVerificationService } from "./identity-verification.service";

@Controller("loan-applications/:applicationId/identity-verifications")
@UseGuards(RoleGuard)
@RequireRoles("CUSTOMER")
@UsePipes(new RequestValidationPipe())
export class IdentityVerificationController {
  constructor(private readonly identityVerificationService: IdentityVerificationService) {}

  @Post()
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
