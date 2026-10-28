import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { ProductInternalTokenGuard } from "../../common/guards/product-internal-token.guard";
import { LoanProductService } from "./loan-product.service";

@Controller("internal/loan-products")
export class InternalLoanProductController {
  constructor(private readonly loanProductService: LoanProductService) {}

  @Get(":productId")
  @UseGuards(ProductInternalTokenGuard)
  get(@Param("productId", new ParseUUIDPipe()) id: string) {
    return this.loanProductService.getById(id);
  }

  @Get(":productId/validation-terms")
  @UseGuards(ProductInternalTokenGuard)
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
