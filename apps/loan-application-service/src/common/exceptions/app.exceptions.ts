import { HttpException, HttpStatus } from "@nestjs/common";

import { ErrorCodes } from "../constants/error-codes";

export interface ErrorDetail {
  field: string;
  message: string;
}

export class AppException extends HttpException {
  constructor(status: number, code: string, message: string, details: ErrorDetail[] = []) {
    super({ code, message, details }, status);
  }
}

export class ValidationException extends AppException {
  constructor(details: ErrorDetail[] = []) {
    super(
      HttpStatus.BAD_REQUEST,
      ErrorCodes.VALIDATION_ERROR,
      "The request contains invalid fields.",
      details,
    );
  }
}

export function applicationNotEditableException(): AppException {
  return new AppException(
    409,
    ErrorCodes.APPLICATION_NOT_EDITABLE,
    "The loan application can only be edited while it is in DRAFT status.",
  );
}

export function forbiddenException(): AppException {
  return new AppException(
    403,
    ErrorCodes.FORBIDDEN,
    "You do not have permission to perform this action.",
  );
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

export class ForbiddenException extends AppException {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      ErrorCodes.FORBIDDEN,
      "You do not have permission to perform this action.",
    );
  }
}

export class ApplicationNotFoundException extends AppException {
  constructor() {
    super(
      HttpStatus.NOT_FOUND,
      ErrorCodes.APPLICATION_NOT_FOUND,
      "The requested loan application was not found.",
    );
  }
}

export class ApplicationNotEditableException extends AppException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      ErrorCodes.APPLICATION_NOT_EDITABLE,
      "Identity verification is only allowed while the application is in DRAFT status.",
    );
  }
}

export class ContractApplicationNotEditableException extends AppException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      ErrorCodes.APPLICATION_NOT_EDITABLE,
      "The loan application cannot have a contract created in its current status.",
    );
  }
}

export class ApplicationNotReadyException extends AppException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCodes.APPLICATION_NOT_READY,
      "The loan application does not meet the requirements for contract creation.",
    );
  }
}

export class AccountVerificationNotEditableException extends AppException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      ErrorCodes.APPLICATION_NOT_EDITABLE,
      "Disbursement account verification is only allowed while the application is in DRAFT status.",
    );
  }
}

export class AccountInformationIncompleteException extends AppException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCodes.ACCOUNT_INFORMATION_INCOMPLETE,
      "Complete the disbursement account information before verification.",
    );
  }
}

export class DependencyUnavailableException extends AppException {
  constructor() {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorCodes.SERVICE_UNAVAILABLE,
      "A required service is temporarily unavailable.",
    );
  }
}
