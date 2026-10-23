import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from "class-validator";

export class LoginDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
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
