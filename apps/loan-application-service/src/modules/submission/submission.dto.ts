import { Equals, IsBoolean, IsInt, Max, Min } from "class-validator";

export class SubmissionDto {
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  contractVersion!: number;

  @IsBoolean()
  @Equals(true)
  confirm!: boolean;
}
