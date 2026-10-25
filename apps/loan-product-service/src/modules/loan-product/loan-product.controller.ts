import { Controller, Get, Param, ParseUUIDPipe, Query, UsePipes } from "@nestjs/common";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { RequestValidationPipe } from "../../common/pipes/request-validation.pipe";
import { ListLoanProductQuery } from "./loan-product.dto";
import { LoanProductService } from "./loan-product.service";

@Controller("loan-products")
@UsePipes(new RequestValidationPipe())
export class LoanProductController {
  constructor(private readonly loanProductService: LoanProductService) {}

  @Get()
  list(@Query() query: ListLoanProductQuery) {
    return this.loanProductService.list(query);
  }

  @Get(":productId")
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
