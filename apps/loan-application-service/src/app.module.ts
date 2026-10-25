import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { LoanApplicationsModule } from "./modules/loan-applications/loan-applications.module";

import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./modules/prisma/prisma.module";

@Module({
  imports: [PrismaModule, LoanApplicationsModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
