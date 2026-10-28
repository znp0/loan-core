import { Module } from "@nestjs/common";

import { AccessAuthModule } from "@repo/auth";

import { ValidationController } from "./validation.controller";
import { ValidationService } from "./validation.service";

@Module({
  imports: [AccessAuthModule],
  controllers: [ValidationController],
  providers: [ValidationService],
  exports: [ValidationService],
})
export class ValidationModule {}
