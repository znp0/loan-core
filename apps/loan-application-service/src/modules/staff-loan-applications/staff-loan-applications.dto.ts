import { IsIn } from "class-validator";

export class ApplicationDecisionDto {
  @IsIn(["APPROVED", "REJECTED"])
  status!: "APPROVED" | "REJECTED";
}
