import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from "class-validator";

export class LoginDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^0[35789]\d{8}$/, {
    message:
      "phone must be a 10-digit Vietnamese mobile number starting with 03, 05, 07, 08, or 09",
  })
  phone!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RegisterDto extends LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @MinLength(8)
  declare password: string;

  @IsString()
  @Matches(/\S/)
  fullName!: string;
}
