import { Controller, Get, Param, ParseUUIDPipe, Query, UsePipes } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";

import { ApiFailureResponses, RequestValidationPipe } from "@repo/http";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { ListLoanProductQuery } from "./loan-product.dto";
import { productPageSchema, productSchema } from "./loan-product.openapi";
import { LoanProductService } from "./loan-product.service";

@ApiTags("Loan products")
@ApiFailureResponses(500, 503)
@Controller("loan-products")
@UsePipes(new RequestValidationPipe())
export class LoanProductController {
  constructor(private readonly loanProductService: LoanProductService) {}

  @Get()
  @ApiOperation({
    summary: "List active loan products",
    description: "Pagination is zero-based: page defaults to 0 and size to 20 (maximum 100).",
  })
  @ApiResponse({ status: 200, schema: productPageSchema })
  @ApiFailureResponses(400)
  list(@Query() query: ListLoanProductQuery) {
    return this.loanProductService.list(query);
  }

  @Get(":productId")
  @ApiOperation({
    summary: "Read an active loan product",
    description: "Inactive and missing products return 404.",
  })
  @ApiResponse({ status: 200, schema: productSchema })
  @ApiFailureResponses(400, 404)
  @ApiParam({ name: "productId", format: "uuid" })
  get(
    @Param(
      "productId",
      new ParseUUIDPipe({
        exceptionFactory: () =>
          new ValidationException([{ field: "productId", message: "Product ID must be a UUID." }]),
      }),
    )
    productId: string,
  ) {
    return this.loanProductService.get(productId);
  }
}
