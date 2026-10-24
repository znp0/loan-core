import { ValidationPipe } from "@nestjs/common";

import { ValidationException } from "../exceptions/app.exceptions";

export class RequestValidationPipe extends ValidationPipe {
  constructor() {
    super({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new ValidationException(
          errors.flatMap((error) =>
            Object.values(error.constraints ?? {}).map((message) => ({
              field: error.property,
              message,
            })),
          ),
        ),
    });
  }
}
