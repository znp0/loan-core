import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { LoanProductsController } from "./loan-products.controller";
import { LoanProductsService } from "./loan-products.service";
import { InternalLoanProductsController } from "./internal-loan-products.controller";

@Module({
  imports: [PrismaModule],
  controllers: [LoanProductsController, InternalLoanProductsController],
  providers: [LoanProductsService],
})
export class LoanProductsModule {}
