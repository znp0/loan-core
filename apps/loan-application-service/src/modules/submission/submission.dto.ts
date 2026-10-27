import { Equals, IsBoolean, IsInt, Max, Min } from "class-validator";

import { MAX_INT32 } from "../../common/constants/integer.constants";

export class SubmissionDto {
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  contractVersion!: number;

  @IsBoolean()
  @Equals(true)
  confirm!: boolean;
}
