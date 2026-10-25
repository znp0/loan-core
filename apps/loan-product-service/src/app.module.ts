import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { HealthController } from "./health/health.controller";
import { LoanProductModule } from "./modules/loan-product/loan-product.module";
import { PrismaModule } from "./modules/prisma/prisma.module";

@Module({
  imports: [PrismaModule, LoanProductModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
