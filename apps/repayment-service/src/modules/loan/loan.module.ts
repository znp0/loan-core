import { Module } from "@nestjs/common";

import { RepaymentInternalTokenGuard } from "../../common/guards/repayment-internal-token.guard";
import { PrismaModule } from "../prisma/prisma.module";
import { ActiveLoanController } from "./active-loan.controller";
import { ActiveLoanService } from "./active-loan.service";

@Module({
  imports: [PrismaModule],
  controllers: [ActiveLoanController],
  providers: [ActiveLoanService, RepaymentInternalTokenGuard],
})
export class LoanModule {}
