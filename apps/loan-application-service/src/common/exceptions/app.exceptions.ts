import { HttpException } from "@nestjs/common";

export class AppException extends HttpException {
  constructor(status: number, code: string, message: string, details: unknown[] = []) {
    super({ code, message, details }, status);
  }
}

export class ValidationException extends AppException {
  constructor(details: unknown[] = []) {
    super(400, "VALIDATION_ERROR", "The request contains invalid fields.", details);
  }
}

export function applicationNotEditableException(): AppException {
  return new AppException(
    409,
    "APPLICATION_NOT_EDITABLE",
    "The loan application can only be edited while it is in DRAFT status.",
  );
}

export function forbiddenException(): AppException {
  return new AppException(403, "FORBIDDEN", "You do not have permission to perform this action.");
}
