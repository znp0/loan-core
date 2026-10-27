import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { RequireRoles, RoleGuard, type AuthenticatedRequest } from "../../common/guards/role.guard";
import { ContractService } from "./contract.service";

@Controller("loan-applications/:applicationId/contract")
@UseGuards(RoleGuard)
@RequireRoles("CUSTOMER")
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @Get()
  @RequireRoles("CUSTOMER", "STAFF")
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
    return this.contractService.get(applicationId, request.user!.id, request.user!.role);
  }

  @Post()
  async create(
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
    @Res({ passthrough: true }) response: { status: (code: number) => unknown },
  ) {
    const result = await this.contractService.create(applicationId, request.user!.id);
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);

    return result.contract;
  }
}
