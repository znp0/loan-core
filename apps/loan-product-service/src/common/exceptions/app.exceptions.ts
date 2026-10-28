import { HttpStatus } from "@nestjs/common";

import { AppException } from "@repo/http";

import { ErrorCodes } from "../constants/error-codes";

export { AppException, ValidationException, UnauthorizedException } from "@repo/http";
export type { ErrorDetail } from "@repo/http";

export class ProductNotFoundException extends AppException {
  constructor() {
    super(
      HttpStatus.NOT_FOUND,
      ErrorCodes.PRODUCT_NOT_FOUND,
      "The requested loan product was not found.",
    );
  }
}
