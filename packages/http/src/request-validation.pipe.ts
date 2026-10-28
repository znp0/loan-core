import { ValidationPipe, type ValidationPipeOptions } from "@nestjs/common";
import type { ValidationError } from "class-validator";

import { type ErrorDetail, ValidationException } from "./app.exceptions";

function collectDetails(errors: ValidationError[], prefix = ""): ErrorDetail[] {
  return errors.flatMap((error) => {
    const field = `${prefix}${error.property}`;

    return [
      ...Object.values(error.constraints ?? {}).map((message) => ({ field, message })),
      ...collectDetails(error.children ?? [], `${field}.`),
    ];
  });
}

export class RequestValidationPipe extends ValidationPipe {
  constructor(
    options: Pick<ValidationPipeOptions, "forbidNonWhitelisted"> & { message?: string } = {},
  ) {
    super({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: options.forbidNonWhitelisted ?? true,
      exceptionFactory: (errors) =>
        new ValidationException(collectDetails(errors), options.message),
    });
  }
}
