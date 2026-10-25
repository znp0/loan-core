import {
  Controller,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import {
  CustomerAccessGuard,
  type CustomerRequest,
} from "../../common/guards/customer-access.guard";
import { ContractService } from "./contract.service";

type ContractRequest = CustomerRequest & {
  headers: CustomerRequest["headers"] & {
    "content-length"?: string;
    "transfer-encoding"?: string;
  };
  query: Record<string, unknown>;
  body: unknown;
};

@Controller("loan-applications/:applicationId/contract")
@UseGuards(CustomerAccessGuard)
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

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
    @Req() request: ContractRequest,
    @Res({ passthrough: true }) response: { status: (code: number) => unknown },
  ) {
    if (Object.keys(request.query).length > 0) {
      throw new ValidationException([
        { field: "query", message: "Query parameters are not allowed." },
      ]);
    }
    if (
      (request.headers["content-length"] !== undefined &&
        request.headers["content-length"] !== "0") ||
      request.headers["transfer-encoding"] !== undefined ||
      (request.body !== undefined &&
        (request.body === null ||
          typeof request.body !== "object" ||
          Object.keys(request.body).length > 0))
    ) {
      throw new ValidationException([{ field: "body", message: "Request body must be empty." }]);
    }

    const result = await this.contractService.create(applicationId, request.customerId!);
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);

    return result.contract;
  }
}
