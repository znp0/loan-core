import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from "class-validator";

export class CreatePaymentDto {
  @IsUUID()
  installmentId!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amount!: number;
}

export class PaymentHistoryDto {
  @IsOptional()
  @Matches(/^[1-9]\d{0,5}$/)
  page?: string;

  @IsOptional()
  @Matches(/^(?:[1-9]|[1-9]\d|100)$/)
  limit?: string;
}
