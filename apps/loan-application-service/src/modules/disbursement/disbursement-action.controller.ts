import {
  Controller,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";

import { RequireRoles, RoleGuard } from "@repo/auth";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { DisbursementActionService } from "./disbursement-action.service";

@Controller("staff/loan-applications/:applicationId/disbursement")
@UseGuards(RoleGuard)
@RequireRoles("STAFF")
export class DisbursementActionController {
  constructor(private readonly disbursements: DisbursementActionService) {}

  @Post()
  @HttpCode(200)
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
