import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { LoanProductsController } from "./loan-products.controller";
import { LoanProductsService } from "./loan-products.service";

@Module({
  imports: [PrismaModule],
  controllers: [LoanProductsController],
  providers: [LoanProductsService],
})
export class LoanProductsModule {}
