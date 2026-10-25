export const ErrorCodes = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
  NOT_FOUND: "NOT_FOUND",
  DATABASE_ERROR: "DATABASE_ERROR",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
