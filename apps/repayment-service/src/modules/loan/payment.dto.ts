import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from "class-validator";

export class CreatePaymentDto {
  @IsUUID()
  @ApiProperty({ type: "string", format: "uuid" })
  installmentId!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  @ApiProperty({ type: "integer", minimum: 1, maximum: 9007199254740991 })
  amount!: number;
}

export class PaymentHistoryDto {
  @IsOptional()
  @Matches(/^[1-9]\d{0,5}$/)
  @ApiProperty({ type: "string", required: false, default: "1", pattern: "^[1-9]\\d{0,5}$" })
  page?: string;

  @IsOptional()
  @Matches(/^(?:[1-9]|[1-9]\d|100)$/)
  @ApiProperty({
    type: "string",
    required: false,
    default: "20",
    pattern: "^(?:[1-9]|[1-9]\\d|100)$",
  })
  limit?: string;
}
