import { Module } from "@nestjs/common";

import { HealthController } from "./health/health.controller";
import { LoanModule } from "./modules/loan/loan.module";

@Module({
  imports: [LoanModule],
  controllers: [HealthController],
})
export class AppModule {}
