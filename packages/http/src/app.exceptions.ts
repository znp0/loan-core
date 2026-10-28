import { HttpException, HttpStatus } from "@nestjs/common";

export interface ErrorDetail {
  field: string;
  message: string;
}

export interface ErrorResponse {
  code: string;
  message: string;
  details: ErrorDetail[];
}

export class AppException extends HttpException {
  constructor(status: number, code: string, message: string, details: ErrorDetail[] = []) {
    super({ code, message, details } satisfies ErrorResponse, status);
  }
}

export class ValidationException extends AppException {
  constructor(details: ErrorDetail[] = [], message = "The request contains invalid fields.") {
    super(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message, details);
  }
}

export class UnauthorizedException extends AppException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      "UNAUTHORIZED",
      "Authentication is required to access this resource.",
    );
  }
}

export class ForbiddenException extends AppException {
  constructor() {
    super(HttpStatus.FORBIDDEN, "FORBIDDEN", "You do not have permission to perform this action.");
  }
}
