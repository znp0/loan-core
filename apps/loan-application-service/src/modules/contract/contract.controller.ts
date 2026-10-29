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
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";

import { RequireRoles, RoleGuard, type AuthenticatedRequest } from "@repo/auth";
import { ApiFailureResponses } from "@repo/http";

import { contractSchema } from "../../common/api.schemas";
import { ValidationException } from "../../common/exceptions/app.exceptions";
import { ContractService } from "./contract.service";

@ApiTags("Contracts")
@ApiFailureResponses(500, 503)
@ApiCookieAuth("accessCookie")
@Controller("loan-applications/:applicationId/contract")
@UseGuards(RoleGuard)
@RequireRoles("CUSTOMER")
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @Get()
  @RequireRoles("CUSTOMER", "STAFF")
  @ApiOperation({
    summary: "Read the latest contract",
    description:
      "CUSTOMER owner or STAFF. Returns the persisted financial schedule and signed content hash.",
  })
  @ApiResponse({ status: 200, schema: contractSchema })
  @ApiFailureResponses(400, 401, 403, 404)
  @ApiParam({ name: "applicationId", format: "uuid" })
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
  @ApiOperation({
    summary: "Prepare a contract for signing",
    description:
      "CUSTOMER owner, DRAFT only. Revalidates readiness and saves application/product snapshots. Returns 201 for a new version or 200 for an unchanged existing draft. No request body is used.",
  })
  @ApiResponse({ status: 201, schema: contractSchema })
  @ApiFailureResponses(400, 401, 403, 404, 409, 422)
  @ApiParam({ name: "applicationId", format: "uuid" })
  @ApiResponse({ status: 200, schema: contractSchema, description: "Existing unchanged draft." })
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
