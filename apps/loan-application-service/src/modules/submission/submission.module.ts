import { Module } from "@nestjs/common";

import { RoleGuardModule } from "../../common/guards/role-guard.module";
import { ValidationModule } from "../validation/validation.module";
import { SubmissionController } from "./submission.controller";
import { SubmissionService } from "./submission.service";

@Module({
  imports: [RoleGuardModule, ValidationModule],
  controllers: [SubmissionController],
  providers: [SubmissionService],
})
export class SubmissionModule {}
