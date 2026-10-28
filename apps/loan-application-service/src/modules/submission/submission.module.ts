import { Module } from "@nestjs/common";

import { AccessAuthModule } from "@repo/auth";

import { ValidationModule } from "../validation/validation.module";
import { SubmissionController } from "./submission.controller";
import { SubmissionService } from "./submission.service";

@Module({
  imports: [AccessAuthModule, ValidationModule],
  controllers: [SubmissionController],
  providers: [SubmissionService],
})
export class SubmissionModule {}
