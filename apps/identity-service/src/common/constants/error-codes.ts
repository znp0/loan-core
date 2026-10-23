export const ErrorCodes = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  PHONE_ALREADY_EXISTS: "PHONE_ALREADY_EXISTS",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
