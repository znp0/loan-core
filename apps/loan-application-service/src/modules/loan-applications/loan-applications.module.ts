import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { CustomerGuard } from "../../common/auth/customer.guard";
import { PrismaModule } from "../prisma/prisma.module";
import { ApplicationEligibilityPolicy } from "./application-eligibility.policy";
import { DocumentStorage } from "./document.storage";
import { LoanProductClient } from "./loan-product.client";
import { LoanApplicationsController } from "./loan-applications.controller";
import { LoanApplicationsService } from "./loan-applications.service";

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;

        if (!secret || Buffer.byteLength(secret) < 32) {
          throw new Error("JWT_SECRET must match identity-service and contain at least 32 bytes");
        }

        return { secret };
      },
    }),
  ],
  controllers: [LoanApplicationsController],
  providers: [
    CustomerGuard,
    LoanApplicationsService,
    LoanProductClient,
    DocumentStorage,
    ApplicationEligibilityPolicy,
  ],
})
export class LoanApplicationsModule {}
