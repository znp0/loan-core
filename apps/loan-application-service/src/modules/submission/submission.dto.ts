import { ApiProperty } from "@nestjs/swagger";
import { Equals, IsBoolean, IsInt, Max, Min } from "class-validator";

import { MAX_INT32 } from "../../common/constants/integer.constants";

export class SubmissionDto {
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  @ApiProperty({ type: "integer", minimum: 1, maximum: 2147483647 })
  contractVersion!: number;

  @IsBoolean()
  @Equals(true)
  @ApiProperty({ type: "boolean", enum: [true] })
  confirm!: boolean;
}
