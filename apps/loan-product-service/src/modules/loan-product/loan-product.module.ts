import { Module } from "@nestjs/common";

import { ProductInternalTokenGuard } from "../../common/guards/product-internal-token.guard";
import { PrismaModule } from "../prisma/prisma.module";
import { InternalLoanProductController } from "./internal-loan-product.controller";
import { LoanProductController } from "./loan-product.controller";
import { LoanProductService } from "./loan-product.service";

@Module({
  imports: [PrismaModule],
  controllers: [LoanProductController, InternalLoanProductController],
  providers: [LoanProductService, ProductInternalTokenGuard],
})
export class LoanProductModule {}
