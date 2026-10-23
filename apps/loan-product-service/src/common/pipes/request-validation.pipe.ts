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
          errors.map((error) => ({
            field: error.property,
            message: Object.values(error.constraints ?? {})[0] ?? "Invalid value.",
          })),
        ),
    });
  }
}
