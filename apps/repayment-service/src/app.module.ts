import { Module } from "@nestjs/common";

import { HttpModule } from "@repo/http";

import { HealthController } from "./health/health.controller";
import { LoanModule } from "./modules/loan/loan.module";

@Module({
  imports: [HttpModule, LoanModule],
  controllers: [HealthController],
})
export class AppModule {}
