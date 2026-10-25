import { IsISO8601, IsNotEmpty, IsString, Matches } from "class-validator";

export class IdentityVerificationDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  identityNumber!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  fullName!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true, strictSeparator: true })
  dateOfBirth!: string;
}
