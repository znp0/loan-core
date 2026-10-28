import { HttpStatus } from "@nestjs/common";

import { AppException } from "@repo/http";

import { ErrorCodes } from "../constants/error-codes";

export {
  AppException,
  ValidationException,
  UnauthorizedException,
  ForbiddenException,
} from "@repo/http";
export type { ErrorDetail } from "@repo/http";

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

export class ApplicationNotFoundException extends AppException {
  constructor() {
    super(
      HttpStatus.NOT_FOUND,
      ErrorCodes.APPLICATION_NOT_FOUND,
      "The requested loan application was not found.",
    );
  }
}

export class ContractNotFoundException extends AppException {
  constructor() {
    super(HttpStatus.NOT_FOUND, ErrorCodes.CONTRACT_NOT_FOUND, "The contract was not found.");
  }
}

export class DisbursementNotFoundException extends AppException {
  constructor() {
    super(
      HttpStatus.NOT_FOUND,
      ErrorCodes.DISBURSEMENT_NOT_FOUND,
      "The disbursement record was not found.",
    );
  }
}

export class ContractVersionMismatchException extends AppException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      ErrorCodes.CONTRACT_VERSION_MISMATCH,
      "The contract preview is outdated. Create and review a new preview before submission.",
    );
  }
}

export class SubmissionNotEditableException extends AppException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      ErrorCodes.APPLICATION_NOT_EDITABLE,
      "The loan application is not available for submission in its current status.",
    );
  }
}

export class SubmissionNotReadyException extends AppException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCodes.APPLICATION_NOT_READY,
      "The loan application is not ready for submission.",
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
