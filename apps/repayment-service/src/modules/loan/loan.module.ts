import { Module } from "@nestjs/common";

import { AccessAuthModule, InternalAuthModule } from "@repo/auth";

import { PrismaModule } from "../prisma/prisma.module";
import { ActiveLoanController } from "./active-loan.controller";
import { ActiveLoanService } from "./active-loan.service";
import { RepaymentScheduleController } from "./repayment-schedule.controller";
import { RepaymentScheduleService } from "./repayment-schedule.service";

@Module({
  imports: [PrismaModule, AccessAuthModule, InternalAuthModule],
  controllers: [ActiveLoanController, RepaymentScheduleController],
  providers: [ActiveLoanService, RepaymentScheduleService],
})
export class LoanModule {}
