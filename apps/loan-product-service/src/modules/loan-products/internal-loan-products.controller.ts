import { timingSafeEqual } from "node:crypto";

import {
  Controller,
  Get,
  Headers,
  HttpException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from "@nestjs/common";

import { ValidationException } from "../../common/exceptions/app.exceptions";
import { ProductInternalTokenGuard } from "../../common/guards/product-internal-token.guard";
import { LoanProductsService } from "./loan-products.service";

@Controller("internal/loan-products")
export class InternalLoanProductsController {
  constructor(private readonly loanProductsService: LoanProductsService) {}

  @Get(":productId")
  get(
    @Param("productId", new ParseUUIDPipe()) id: string,
    @Headers("x-service-token") token?: string,
  ) {
    const expected = process.env.APPLICATION_SERVICE_TOKEN;

    if (
      !expected ||
      !token ||
      Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    ) {
      throw new HttpException(
        { code: "FORBIDDEN", message: "Service authentication required.", details: [] },
        403,
      );
    }

    return this.loanProductsService.getById(id);
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
    return this.loanProductsService.getValidationTerms(productId);
  }
}
