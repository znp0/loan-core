import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";

import { AppException, type ErrorResponse } from "./app.exceptions";

const statusErrors: Record<number, { code: string; message: string }> = {
  400: { code: "VALIDATION_ERROR", message: "The request contains invalid fields." },
  401: { code: "UNAUTHORIZED", message: "Authentication is required to access this resource." },
  403: { code: "FORBIDDEN", message: "You do not have permission to perform this action." },
  404: { code: "NOT_FOUND", message: "Not Found" },
  409: { code: "CONFLICT", message: "The request conflicts with an existing resource." },
  413: { code: "FILE_TOO_LARGE", message: "The uploaded file exceeds the maximum allowed size." },
  422: { code: "VALIDATION_ERROR", message: "The request cannot be processed." },
  429: { code: "TOO_MANY_REQUESTS", message: "Too many requests. Try again later." },
  503: { code: "SERVICE_UNAVAILABLE", message: "A required service is temporarily unavailable." },
};

function isErrorResponse(value: unknown): value is ErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    value.code.length > 0 &&
    "message" in value &&
    typeof value.message === "string" &&
    "details" in value &&
    Array.isArray(value.details) &&
    value.details.every((detail: unknown) => {
      return (
        typeof detail === "object" &&
        detail !== null &&
        "field" in detail &&
        typeof detail.field === "string" &&
        "message" in detail &&
        typeof detail.message === "string"
      );
    })
  );
}

function isDatabaseUnavailable(value: unknown, depth = 0): boolean {
  if (typeof value !== "object" || value === null || depth > 3) {
    return false;
  }

  if (
    "code" in value &&
    typeof value.code === "string" &&
    [
      "P1001",
      "P1002",
      "P1008",
      "P1017",
      "P2024",
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "57P01",
      "57P02",
      "57P03",
    ].includes(value.code)
  ) {
    return true;
  }

  return "cause" in value && isDatabaseUnavailable(value.cause, depth + 1);
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status(status: number): { json(body: ErrorResponse): void };
    }>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // Domain providers construct trusted, actionable errors; unexpected server failures stay generic.
      if ((status < 500 || exception instanceof AppException) && isErrorResponse(body)) {
        response
          .status(status)
          .json({ code: body.code, message: body.message, details: body.details });
        return;
      }

      const normalized = statusErrors[status];

      if (normalized) {
        response.status(status).json({ ...normalized, details: [] });
        return;
      }

      if (status >= 400 && status < 500) {
        response.status(status).json({
          code: "HTTP_ERROR",
          message: "The request could not be completed.",
          details: [],
        });
        return;
      }

      this.logger.error("Unexpected HTTP request failure");
      response.status(status).json({
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred.",
        details: [],
      });
      return;
    }

    if (isDatabaseUnavailable(exception)) {
      this.logger.error("Database connection failed");
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        code: "DATABASE_ERROR",
        message: "Database temporarily unavailable.",
        details: [],
      });
      return;
    }

    this.logger.error("Unexpected request failure");
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
      details: [],
    });
  }
}
