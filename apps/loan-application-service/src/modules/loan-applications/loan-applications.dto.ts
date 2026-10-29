import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

import { MAX_INT32 } from "../../common/constants/integer.constants";
import { MAX_APPLICATION_TEXT_LENGTH, REQUIRED_CONTACT_COUNT } from "./loan-applications.constants";

export class ApplicantInfoDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  @ApiProperty({ type: "string", maxLength: MAX_APPLICATION_TEXT_LENGTH, pattern: "\\S" })
  fullName?: string | null;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  @ApiProperty({ type: "string", format: "date", pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  dateOfBirth?: string | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  @ApiProperty({ type: "string", maxLength: MAX_APPLICATION_TEXT_LENGTH, pattern: "\\S" })
  identityNumber?: string | null;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  @ApiProperty({ type: "string", format: "date", pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  identityIssuedDate?: string | null;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  @ApiProperty({ type: "string", format: "date", pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  identityExpiryDate?: string | null;

  @IsEmail()
  @MaxLength(254)
  @ApiProperty({ type: "string", format: "email", maxLength: 254 })
  email?: string | null;

  @Matches(/^\+?[0-9]{9,15}$/)
  @ApiProperty({ type: "string", pattern: "^\\+?[0-9]{9,15}$" })
  phone?: string | null;
}

export class CurrentAddressDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  @ApiProperty({ type: "string", maxLength: MAX_APPLICATION_TEXT_LENGTH, pattern: "\\S" })
  addressLine?: string | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  @ApiProperty({ type: "string", maxLength: MAX_APPLICATION_TEXT_LENGTH, pattern: "\\S" })
  ward?: string | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  @ApiProperty({ type: "string", maxLength: MAX_APPLICATION_TEXT_LENGTH, pattern: "\\S" })
  district?: string | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  @ApiProperty({ type: "string", maxLength: MAX_APPLICATION_TEXT_LENGTH, pattern: "\\S" })
  province?: string | null;
}

export class EmploymentInfoDto {
  @IsIn(["SALARIED", "SELF_EMPLOYED", "OTHER"])
  @ApiProperty({ type: "string", enum: ["SALARIED", "SELF_EMPLOYED", "OTHER"] })
  employmentType?: "SALARIED" | "SELF_EMPLOYED" | "OTHER" | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  @ApiProperty({ type: "string", maxLength: MAX_APPLICATION_TEXT_LENGTH, pattern: "\\S" })
  employerName?: string | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  @ApiProperty({ type: "string", maxLength: MAX_APPLICATION_TEXT_LENGTH, pattern: "\\S" })
  jobTitle?: string | null;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  @ApiProperty({ type: "string", format: "date", pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  employmentStartDate?: string | null;
}

export class FinancialInfoDto {
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  @ApiProperty({ type: "integer", minimum: 0, maximum: 9007199254740991 })
  monthlyIncome?: number | null;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  @ApiProperty({ type: "integer", minimum: 0, maximum: 9007199254740991 })
  otherMonthlyIncome?: number | null;
}

export class DisbursementAccountDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  @ApiProperty({ type: "string", maxLength: MAX_APPLICATION_TEXT_LENGTH, pattern: "\\S" })
  accountNumber?: string | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  @ApiProperty({ type: "string", maxLength: MAX_APPLICATION_TEXT_LENGTH, pattern: "\\S" })
  accountHolderName?: string | null;
}

export class ContactDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  @ApiProperty({ type: "string", maxLength: MAX_APPLICATION_TEXT_LENGTH, pattern: "\\S" })
  fullName!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  @ApiProperty({ type: "string", maxLength: MAX_APPLICATION_TEXT_LENGTH, pattern: "\\S" })
  relationship!: string;

  @Matches(/^\+?[0-9]{9,15}$/)
  @ApiProperty({ type: "string", pattern: "^\\+?[0-9]{9,15}$" })
  phone!: string;
}

export class CreateApplicationDto {
  @IsUUID()
  @ApiProperty({ type: "string", format: "uuid" })
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  @ApiProperty({ type: "integer", minimum: 1, maximum: 9007199254740991 })
  requestedAmount!: number;

  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  @ApiProperty({ type: "integer", minimum: 1, maximum: 2147483647 })
  termMonths!: number;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  @ApiProperty({ type: "string", maxLength: MAX_APPLICATION_TEXT_LENGTH, pattern: "\\S" })
  purpose!: string;
}

export class UpdateApplicationDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  @ApiProperty({ type: "integer", minimum: 1, maximum: 9007199254740991 })
  requestedAmount?: number;

  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  @ApiProperty({ type: "integer", minimum: 1, maximum: 2147483647 })
  termMonths?: number;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  @ApiProperty({ type: "string", maxLength: MAX_APPLICATION_TEXT_LENGTH, pattern: "\\S" })
  purpose?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => ApplicantInfoDto)
  @ApiProperty({ type: () => ApplicantInfoDto })
  applicantInfo?: ApplicantInfoDto;

  @IsObject()
  @ValidateNested()
  @Type(() => CurrentAddressDto)
  @ApiProperty({ type: () => CurrentAddressDto })
  currentAddress?: CurrentAddressDto;

  @IsObject()
  @ValidateNested()
  @Type(() => EmploymentInfoDto)
  @ApiProperty({ type: () => EmploymentInfoDto })
  employmentInfo?: EmploymentInfoDto;

  @IsObject()
  @ValidateNested()
  @Type(() => FinancialInfoDto)
  @ApiProperty({ type: () => FinancialInfoDto })
  financialInfo?: FinancialInfoDto;

  @IsObject()
  @ValidateNested()
  @Type(() => DisbursementAccountDto)
  @ApiProperty({ type: () => DisbursementAccountDto })
  disbursementAccount?: DisbursementAccountDto;

  @IsArray()
  @ArrayMinSize(REQUIRED_CONTACT_COUNT)
  @ArrayMaxSize(REQUIRED_CONTACT_COUNT)
  @ValidateNested({ each: true })
  @Type(() => ContactDto)
  @ApiProperty({ type: () => ContactDto, isArray: true, minItems: 2, maxItems: 2 })
  contacts?: ContactDto[];
}

export class UploadDocumentDto {
  @IsIn(["ID_FRONT", "ID_BACK"])
  @ApiProperty({ type: "string", enum: ["ID_FRONT", "ID_BACK"] })
  type!: "ID_FRONT" | "ID_BACK";
}
