import { Module } from "@nestjs/common";

import { AuthModule } from "./modules/auth/auth.module";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./modules/prisma/prisma.module";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
