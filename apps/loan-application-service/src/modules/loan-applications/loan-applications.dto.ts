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
  ValidateIf,
  ValidateNested,
} from "class-validator";

export class ApplicantInfoDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
  fullName?: string | null;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dateOfBirth?: string | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
  identityNumber?: string | null;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  identityIssuedDate?: string | null;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  identityExpiryDate?: string | null;

  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @Matches(/^\+?[0-9]{9,15}$/)
  phone?: string | null;
}

export class CurrentAddressDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
  addressLine?: string | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
  ward?: string | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
  district?: string | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
  province?: string | null;
}

export class EmploymentInfoDto {
  @IsIn(["SALARIED", "SELF_EMPLOYED", "OTHER"])
  employmentType?: "SALARIED" | "SELF_EMPLOYED" | "OTHER" | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
  employerName?: string | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
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
  @MaxLength(1000)
  bankCode?: string | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
  accountNumber?: string | null;

  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
  accountHolderName?: string | null;
}

export class ContactDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
  fullName!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
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
  @Max(2147483647)
  termMonths!: number;

  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
  purpose!: string;
}

export class UpdateApplicationDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  requestedAmount?: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  termMonths?: number;

  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
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
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => ContactDto)
  contacts?: ContactDto[];
}

export class UploadDocumentDto {
  @IsIn(["ID_FRONT", "ID_BACK"])
  type!: "ID_FRONT" | "ID_BACK";
}
