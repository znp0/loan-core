import { Module } from "@nestjs/common";

import { AccessAuthModule, InternalAuthModule } from "@repo/auth";

import { PrismaModule } from "../prisma/prisma.module";
import { ActiveLoanController } from "./active-loan.controller";
import { ActiveLoanService } from "./active-loan.service";
import { InternalLoanController } from "./internal-loan.controller";
import { LoanCreationService } from "./loan-creation.service";
import { RepaymentScheduleController } from "./repayment-schedule.controller";
import { RepaymentScheduleService } from "./repayment-schedule.service";

@Module({
  imports: [PrismaModule, AccessAuthModule, InternalAuthModule],
  controllers: [ActiveLoanController, RepaymentScheduleController, InternalLoanController],
  providers: [ActiveLoanService, RepaymentScheduleService, LoanCreationService],
})
export class LoanModule {}
