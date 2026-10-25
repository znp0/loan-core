import { Module } from "@nestjs/common";

import { ProductInternalTokenGuard } from "../../common/guards/product-internal-token.guard";
import { PrismaModule } from "../prisma/prisma.module";
import { InternalLoanProductsController } from "./internal-loan-products.controller";
import { LoanProductsController } from "./loan-products.controller";
import { LoanProductsService } from "./loan-products.service";

@Module({
  imports: [PrismaModule],
  controllers: [LoanProductsController, InternalLoanProductsController],
  providers: [LoanProductsService, ProductInternalTokenGuard],
})
export class LoanProductsModule {}
