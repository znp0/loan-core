import { Module } from "@nestjs/common";

import { CustomerAccessModule } from "../../common/guards/customer-access.module";
import { ValidationModule } from "../validation/validation.module";
import { SubmissionController } from "./submission.controller";
import { SubmissionService } from "./submission.service";

@Module({
  imports: [CustomerAccessModule, ValidationModule],
  controllers: [SubmissionController],
  providers: [SubmissionService],
})
export class SubmissionModule {}
