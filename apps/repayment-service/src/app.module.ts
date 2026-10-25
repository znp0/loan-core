import { Module } from "@nestjs/common";

import { HealthController } from "./health/health.controller";
import { LoansModule } from "./modules/loans/loans.module";

@Module({
  imports: [LoansModule],
  controllers: [HealthController],
})
export class AppModule {}
