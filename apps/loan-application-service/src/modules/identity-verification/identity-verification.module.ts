import { Module } from "@nestjs/common";

import { AccessAuthModule } from "@repo/auth";

import { IdentityVerificationController } from "./identity-verification.controller";
import { IdentityVerificationService } from "./identity-verification.service";

@Module({
  imports: [AccessAuthModule],
  controllers: [IdentityVerificationController],
  providers: [IdentityVerificationService],
})
export class IdentityVerificationModule {}
