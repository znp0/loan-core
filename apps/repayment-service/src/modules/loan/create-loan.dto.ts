import { ApiProperty } from "@nestjs/swagger";
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
  @ApiProperty({ type: "string", format: "uuid" })
  applicationId!: string;

  @IsUUID()
  @ApiProperty({ type: "string", format: "uuid" })
  customerId!: string;

  @IsUUID()
  @ApiProperty({ type: "string", format: "uuid" })
  contractId!: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/)
  @ApiProperty({
    type: "string",
    format: "date-time",
    pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?(?:Z|[+-]\\d{2}:\\d{2})$",
  })
  disbursedAt!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  @ApiProperty({ type: "integer", minimum: 1, maximum: 9007199254740991 })
  principalAmount!: number;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  @ApiProperty({ type: "integer", minimum: 0, maximum: 9007199254740991 })
  totalInterest!: number;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  @ApiProperty({ type: "integer", minimum: 1, maximum: 9007199254740991 })
  totalPayable!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1200)
  @IsObject({ each: true })
  @ApiProperty({
    type: "array",
    minItems: 1,
    maxItems: 1200,
    items: {
      type: "object",
      required: ["installmentNumber", "principalAmount", "interestAmount", "totalAmount"],
      properties: {
        installmentNumber: { type: "integer", minimum: 1 },
        principalAmount: { type: "integer", minimum: 0 },
        interestAmount: { type: "integer", minimum: 0 },
        totalAmount: { type: "integer", minimum: 0 },
      },
    },
    description:
      "Signed contract schedule; installment order, safe integer amounts and all totals must match.",
  })
  schedule!: unknown[];
}
