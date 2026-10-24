import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from "@nestjs/common";

import { ErrorCodes } from "../constants/error-codes";

@Catch(BadRequestException)
export class HttpExceptionFilter implements ExceptionFilter<BadRequestException> {
  catch(_exception: BadRequestException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();

    response.status(HttpStatus.BAD_REQUEST).json({
      code: ErrorCodes.VALIDATION_ERROR,
      message: "The request contains invalid fields.",
      details: [],
    });
  }
}
