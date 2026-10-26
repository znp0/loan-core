import { Controller, Get, Param, ParseUUIDPipe, Query, UsePipes } from "@nestjs/common";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { RequestValidationPipe } from "../../common/pipes/request-validation.pipe";
import { ListLoanProductsQuery } from "./loan-products.dto";
import { LoanProductsService } from "./loan-products.service";

@Controller("loan-products")
@UsePipes(new RequestValidationPipe())
export class LoanProductsController {
  constructor(private readonly loanProductsService: LoanProductsService) {}

  @Get()
  list(@Query() query: ListLoanProductsQuery) {
    return this.loanProductsService.listActive(query);
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
    return this.loanProductsService.getActiveById(productId);
  }
}
