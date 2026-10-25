import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";

import { ErrorCodes } from "../constants/error-codes";

interface ErrorResponse {
  code: string;
  message: string;
  details: { field: string; message: string }[];
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

      if (this.isErrorResponse(body)) {
        response.status(status).json(body);
        return;
      }

      if (status === HttpStatus.BAD_REQUEST) {
        response.status(status).json({
          code: ErrorCodes.VALIDATION_ERROR,
          message: "The request contains invalid fields.",
          details: [],
        });
        return;
      }

      if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
        response.status(status).json({
          code: "FILE_TOO_LARGE",
          message: "The uploaded file exceeds the maximum allowed size.",
          details: [],
        });
        return;
      }

      if (status === HttpStatus.NOT_FOUND) {
        response
          .status(status)
          .json({ code: ErrorCodes.NOT_FOUND, message: "Not Found", details: [] });
        return;
      }
    }

    if (this.isDatabaseUnavailable(exception)) {
      this.logger.error("Database connection failed");
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        code: ErrorCodes.DATABASE_ERROR,
        message: "Database temporarily unavailable.",
        details: [],
      });
      return;
    }

    this.logger.error("Unexpected request failure");
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: ErrorCodes.INTERNAL_SERVER_ERROR,
      message: "An unexpected error occurred.",
      details: [],
    });
  }

  private isErrorResponse(value: unknown): value is ErrorResponse {
    return (
      typeof value === "object" &&
      value !== null &&
      "code" in value &&
      "message" in value &&
      "details" in value
    );
  }

  private isDatabaseUnavailable(value: unknown): boolean {
    if (typeof value !== "object" || value === null || !("code" in value)) {
      return false;
    }

    return (
      typeof value.code === "string" && ["P1001", "P1002", "P1008", "P1017"].includes(value.code)
    );
  }
}
