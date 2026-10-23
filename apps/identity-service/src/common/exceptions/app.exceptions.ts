import { HttpException, HttpStatus } from "@nestjs/common";

import { ErrorCodes, type ErrorCode } from "../constants/error-codes";

export class AppException extends HttpException {
  constructor(status: HttpStatus, code: ErrorCode, message: string, details: unknown[] = []) {
    super({ code, message, details }, status);
  }
}

export class ValidationException extends AppException {
  constructor(details: unknown[] = []) {
    super(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_ERROR, "Invalid request input.", details);
  }
}

export class PhoneAlreadyExistsException extends AppException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      ErrorCodes.PHONE_ALREADY_EXISTS,
      "An account with this phone number already exists.",
    );
  }
}

export class InvalidCredentialsException extends AppException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      ErrorCodes.INVALID_CREDENTIALS,
      "The phone or password is incorrect.",
    );
  }
}
