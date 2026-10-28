import { Module } from "@nestjs/common";

import { InternalAuthModule } from "@repo/auth";

import { PrismaModule } from "../prisma/prisma.module";
import { InternalLoanProductController } from "./internal-loan-product.controller";
import { LoanProductController } from "./loan-product.controller";
import { LoanProductService } from "./loan-product.service";

@Module({
  imports: [PrismaModule, InternalAuthModule],
  controllers: [LoanProductController, InternalLoanProductController],
  providers: [LoanProductService],
})
export class LoanProductModule {}
