import { Module } from "@nestjs/common";

import { HttpModule } from "@repo/http";

import { HealthController } from "./health/health.controller";

@Module({
  imports: [HttpModule],
  controllers: [HealthController],
})
export class AppModule {}
