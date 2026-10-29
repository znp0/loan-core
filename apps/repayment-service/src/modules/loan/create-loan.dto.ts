import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsObject,
  IsUUID,
  Matches,
  Max,
  Min,
} from "class-validator";

export class CreateLoanDto {
  @IsUUID()
  applicationId!: string;

  @IsUUID()
  customerId!: string;

  @IsUUID()
  contractId!: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/)
  disbursedAt!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  principalAmount!: number;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  totalInterest!: number;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  totalPayable!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1200)
  @IsObject({ each: true })
  schedule!: unknown[];
}
