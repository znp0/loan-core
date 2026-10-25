import { HttpException, HttpStatus } from "@nestjs/common";

import { ErrorCodes, type ErrorCode } from "../constants/error-codes";

export interface ErrorDetail {
  field: string;
  message: string;
}

export class AppException extends HttpException {
  constructor(status: HttpStatus, code: ErrorCode, message: string, details: ErrorDetail[] = []) {
    super({ code, message, details }, status);
  }
}

export class ValidationException extends AppException {
  constructor(details: ErrorDetail[]) {
    super(
      HttpStatus.BAD_REQUEST,
      ErrorCodes.VALIDATION_ERROR,
      "The request contains invalid fields.",
      details,
    );
  }
}

export class UnauthorizedException extends AppException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      ErrorCodes.UNAUTHORIZED,
      "Authentication is required to access this resource.",
    );
  }
}

export class ProductNotFoundException extends AppException {
  constructor() {
    super(
      HttpStatus.NOT_FOUND,
      ErrorCodes.PRODUCT_NOT_FOUND,
      "The requested loan product was not found.",
    );
  }
}
