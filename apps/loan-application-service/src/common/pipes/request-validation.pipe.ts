import { ValidationPipe } from "@nestjs/common";
import type { ValidationError } from "class-validator";

import { ValidationException } from "../exceptions/app.exceptions";

function details(errors: ValidationError[], prefix = ""): { field: string; message: string }[] {
  return errors.flatMap((error) => {
    const field = `${prefix}${error.property}`;
    return [
      ...Object.values(error.constraints ?? {}).map((message) => ({ field, message })),
      ...details(error.children ?? [], `${field}.`),
    ];
  });
}

export class RequestValidationPipe extends ValidationPipe {
  constructor() {
    super({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => new ValidationException(details(errors)),
    });
  }
}
