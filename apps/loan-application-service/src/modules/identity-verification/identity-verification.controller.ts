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

import { ValidationException } from "../../common/exceptions/app.exceptions";
import {
  CustomerAccessGuard,
  type CustomerRequest,
} from "../../common/guards/customer-access.guard";
import { RequestValidationPipe } from "../../common/pipes/request-validation.pipe";
import { IdentityVerificationDto } from "./identity-verification.dto";
import { IdentityVerificationService } from "./identity-verification.service";

@Controller("loan-applications/:applicationId/identity-verifications")
@UseGuards(CustomerAccessGuard)
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
    @Req() request: CustomerRequest,
  ) {
    return this.identityVerificationService.verify(applicationId, request.customerId!, input);
  }
}
