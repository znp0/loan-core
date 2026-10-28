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

export class LoanNotFoundException extends AppException {
  constructor() {
    super(HttpStatus.NOT_FOUND, ErrorCodes.LOAN_NOT_FOUND, "The requested loan was not found.");
  }
}
