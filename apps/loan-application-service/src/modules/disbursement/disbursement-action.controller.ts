import {
  Controller,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags, ApiParam } from "@nestjs/swagger";

import { RequireRoles, RoleGuard } from "@repo/auth";
import { ApiFailureResponses, ApiIdempotencyKey } from "@repo/http";

import { disbursementSchema } from "../../common/api.schemas";
import { ValidationException } from "../../common/exceptions/app.exceptions";
import { DisbursementActionService } from "./disbursement-action.service";

@ApiTags("Staff disbursement")
@ApiFailureResponses(500, 503)
@ApiCookieAuth("accessCookie")
@Controller("staff/loan-applications/:applicationId/disbursement")
@UseGuards(RoleGuard)
@RequireRoles("STAFF")
export class DisbursementActionController {
  constructor(private readonly disbursements: DisbursementActionService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: "Start or resume disbursement",
    description:
      "STAFF, APPROVED with a signed contract. Uses contract/account snapshots and ignores unused bodies. Saves transfer success before contacting repayment; publishes SUCCEEDED only after confirming the loan. Uncertain loan creation returns 503 with PROCESSING retained. Retry resumes without another transfer. A FAILED transfer is final for its key; use a new key to retry.",
  })
  @ApiResponse({ status: 200, schema: disbursementSchema })
  @ApiParam({ name: "applicationId", format: "uuid" })
  @ApiIdempotencyKey()
  @ApiFailureResponses(400, 401, 403, 404, 409)
  execute(
    @Param("applicationId", new ParseUUIDPipe()) applicationId: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    if (!key || !/^[A-Za-z0-9._:-]{1,128}$/.test(key)) {
      throw new ValidationException([
        {
          field: "Idempotency-Key",
          message: "Provide 1–128 letters, digits, dots, underscores, colons or hyphens.",
        },
      ]);
    }

    return this.disbursements.execute(applicationId, key);
  }
}
