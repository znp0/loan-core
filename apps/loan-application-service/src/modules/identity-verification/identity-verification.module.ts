import { Module } from "@nestjs/common";

import { RoleGuardModule } from "../../common/guards/role-guard.module";
import { IdentityVerificationController } from "./identity-verification.controller";
import { IdentityVerificationService } from "./identity-verification.service";

@Module({
  imports: [RoleGuardModule],
  controllers: [IdentityVerificationController],
  providers: [IdentityVerificationService],
})
export class IdentityVerificationModule {}
