import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { RepaymentInternalTokenGuard } from "../../common/guards/repayment-internal-token.guard";
import { RoleGuard } from "../../common/guards/role.guard";
import { PrismaModule } from "../prisma/prisma.module";
import { ActiveLoanController } from "./active-loan.controller";
import { ActiveLoanService } from "./active-loan.service";
import { RepaymentScheduleController } from "./repayment-schedule.controller";
import { RepaymentScheduleService } from "./repayment-schedule.service";

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;

        if (!secret) {
          throw new Error("JWT_SECRET is required for repayment access verification.");
        }

        return { secret, verifyOptions: { algorithms: ["HS256"] } };
      },
    }),
  ],
  controllers: [ActiveLoanController, RepaymentScheduleController],
  providers: [ActiveLoanService, RepaymentInternalTokenGuard, RoleGuard, RepaymentScheduleService],
})
export class LoanModule {}
