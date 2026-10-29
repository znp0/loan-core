import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

export class ApplicationDecisionDto {
  @IsIn(["APPROVED", "REJECTED"])
  @ApiProperty({ type: "string", enum: ["APPROVED", "REJECTED"] })
  status!: "APPROVED" | "REJECTED";
}
