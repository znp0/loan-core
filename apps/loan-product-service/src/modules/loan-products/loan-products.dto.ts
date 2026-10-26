import { Transform } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";

function parseQueryInteger(value: unknown): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return Number.NaN;
  }

  return Number(value);
}

export class ListLoanProductsQuery {
  @Transform(({ value }: { value: unknown }) => parseQueryInteger(value))
  @IsInt({ message: "Page must be a non-negative integer." })
  @Min(0, { message: "Page must be a non-negative integer." })
  @Max(Number.MAX_SAFE_INTEGER, { message: "Page must be a non-negative integer." })
  page = 0;

  @Transform(({ value }: { value: unknown }) => parseQueryInteger(value))
  @IsInt({ message: "Size must be between 1 and 100." })
  @Min(1, { message: "Size must be between 1 and 100." })
  @Max(100, { message: "Size must be between 1 and 100." })
  size = 20;
}
