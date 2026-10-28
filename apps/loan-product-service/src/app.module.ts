import { Module } from "@nestjs/common";

import { HttpModule } from "@repo/http";

import { HealthController } from "./health/health.controller";
import { LoanProductModule } from "./modules/loan-product/loan-product.module";
import { PrismaModule } from "./modules/prisma/prisma.module";

@Module({
  imports: [HttpModule, PrismaModule, LoanProductModule],
  controllers: [HealthController],
})
export class AppModule {}
