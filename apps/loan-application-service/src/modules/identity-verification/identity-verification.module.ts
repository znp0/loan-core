import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { CustomerAccessGuard } from "../../common/guards/customer-access.guard";
import { IdentityVerificationController } from "./identity-verification.controller";
import { IdentityVerificationService } from "./identity-verification.service";

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;

        if (!secret) {
          throw new Error("JWT_SECRET is required for loan application identity verification.");
        }

        return { secret, verifyOptions: { algorithms: ["HS256"] } };
      },
    }),
  ],
  controllers: [IdentityVerificationController],
  providers: [CustomerAccessGuard, IdentityVerificationService],
})
export class IdentityVerificationModule {}
