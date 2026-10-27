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
  fullName?: string | null;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dateOfBirth?: string | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  identityNumber?: string | null;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  identityIssuedDate?: string | null;

  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @Matches(/^\+?[0-9]{9,15}$/)
  phone?: string | null;
}

export class CurrentAddressDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  addressLine?: string | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  ward?: string | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  district?: string | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  province?: string | null;
}

export class EmploymentInfoDto {
  @IsIn(["SALARIED", "SELF_EMPLOYED", "OTHER"])
  employmentType?: "SALARIED" | "SELF_EMPLOYED" | "OTHER" | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  employerName?: string | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  jobTitle?: string | null;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  employmentStartDate?: string | null;
}

export class FinancialInfoDto {
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  monthlyIncome?: number | null;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  otherMonthlyIncome?: number | null;
}

export class DisbursementAccountDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  accountNumber?: string | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  accountHolderName?: string | null;
}

export class ContactDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  fullName!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  relationship!: string;

  @Matches(/^\+?[0-9]{9,15}$/)
  phone!: string;
}

export class CreateApplicationDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  requestedAmount!: number;

  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  termMonths!: number;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  purpose!: string;
}

export class UpdateApplicationDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  requestedAmount?: number;

  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  termMonths?: number;

  @IsString()
  @Matches(/\S/)
  @MaxLength(MAX_APPLICATION_TEXT_LENGTH)
  purpose?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => ApplicantInfoDto)
  applicantInfo?: ApplicantInfoDto;

  @IsObject()
  @ValidateNested()
  @Type(() => CurrentAddressDto)
  currentAddress?: CurrentAddressDto;

  @IsObject()
  @ValidateNested()
  @Type(() => EmploymentInfoDto)
  employmentInfo?: EmploymentInfoDto;

  @IsObject()
  @ValidateNested()
  @Type(() => FinancialInfoDto)
  financialInfo?: FinancialInfoDto;

  @IsObject()
  @ValidateNested()
  @Type(() => DisbursementAccountDto)
  disbursementAccount?: DisbursementAccountDto;

  @IsArray()
  @ArrayMinSize(REQUIRED_CONTACT_COUNT)
  @ArrayMaxSize(REQUIRED_CONTACT_COUNT)
  @ValidateNested({ each: true })
  @Type(() => ContactDto)
  contacts?: ContactDto[];
}

export class UploadDocumentDto {
  @IsIn(["ID_FRONT", "ID_BACK"])
  type!: "ID_FRONT" | "ID_BACK";
}
