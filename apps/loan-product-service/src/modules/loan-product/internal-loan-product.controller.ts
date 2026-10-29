import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiSecurity, ApiTags } from "@nestjs/swagger";

import { InternalTokenGuard, RequireInternalToken } from "@repo/auth";
import { ApiFailureResponses } from "@repo/http";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { productSchema, validationTermsSchema } from "./loan-product.openapi";
import { LoanProductService } from "./loan-product.service";

@ApiTags("Internal loan products")
@ApiFailureResponses(500, 503)
@ApiSecurity("internalToken")
@Controller("internal/loan-products")
@RequireInternalToken("PRODUCT_INTERNAL_TOKEN")
export class InternalLoanProductController {
  constructor(private readonly loanProductService: LoanProductService) {}

  @Get(":productId")
  @UseGuards(InternalTokenGuard)
  @ApiOperation({
    summary: "Read product terms",
    description: "Uses PRODUCT_INTERNAL_TOKEN; includes active and inactive products.",
  })
  @ApiResponse({ status: 200, schema: productSchema })
  @ApiFailureResponses(400, 401, 404)
  @ApiParam({ name: "productId", format: "uuid" })
  get(@Param("productId", new ParseUUIDPipe()) id: string) {
    return this.loanProductService.getById(id);
  }

  @Get(":productId/validation-terms")
  @UseGuards(InternalTokenGuard)
  @ApiOperation({
    summary: "Read validation terms",
    description: "Uses PRODUCT_INTERNAL_TOKEN. The annual rate is an exact decimal string.",
  })
  @ApiResponse({ status: 200, schema: validationTermsSchema })
  @ApiFailureResponses(400, 401, 404)
  @ApiParam({ name: "productId", format: "uuid" })
  getValidationTerms(
    @Param(
      "productId",
      new ParseUUIDPipe({
        exceptionFactory: () =>
          new ValidationException([{ field: "productId", message: "Product ID must be a UUID." }]),
      }),
    )
    productId: string,
  ) {
    return this.loanProductService.getValidationTerms(productId);
  }
}
