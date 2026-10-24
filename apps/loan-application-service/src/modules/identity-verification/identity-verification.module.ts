import { Module } from "@nestjs/common";

import { CustomerAccessModule } from "../../common/guards/customer-access.module";
import { IdentityVerificationController } from "./identity-verification.controller";
import { IdentityVerificationService } from "./identity-verification.service";

@Module({
  imports: [CustomerAccessModule],
  controllers: [IdentityVerificationController],
  providers: [IdentityVerificationService],
})
export class IdentityVerificationModule {}
