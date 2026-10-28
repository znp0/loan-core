import { HttpStatus } from "@nestjs/common";

import { AppException } from "@repo/http";

import { ErrorCodes } from "../constants/error-codes";

export { AppException, ValidationException } from "@repo/http";
export type { ErrorDetail } from "@repo/http";

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
