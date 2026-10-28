import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";

import { InternalTokenGuard, RequireInternalToken } from "@repo/auth";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { LoanProductService } from "./loan-product.service";

@Controller("internal/loan-products")
@RequireInternalToken("PRODUCT_INTERNAL_TOKEN")
export class InternalLoanProductController {
  constructor(private readonly loanProductService: LoanProductService) {}

  @Get(":productId")
  @UseGuards(InternalTokenGuard)
  get(@Param("productId", new ParseUUIDPipe()) id: string) {
    return this.loanProductService.getById(id);
  }

  @Get(":productId/validation-terms")
  @UseGuards(InternalTokenGuard)
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
