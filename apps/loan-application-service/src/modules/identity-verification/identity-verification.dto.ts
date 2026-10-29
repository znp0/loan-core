import { ApiProperty } from "@nestjs/swagger";
import { IsISO8601, IsNotEmpty, IsString, Matches } from "class-validator";

export class IdentityVerificationDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @ApiProperty({ type: "string", pattern: "\\S" })
  identityNumber!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @ApiProperty({ type: "string", pattern: "\\S" })
  fullName!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true, strictSeparator: true })
  @ApiProperty({ type: "string", format: "date", pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  dateOfBirth!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true, strictSeparator: true })
  @ApiProperty({ type: "string", format: "date", pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  identityExpiryDate!: string;
}
