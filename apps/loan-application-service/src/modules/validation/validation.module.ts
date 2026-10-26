import { Module } from "@nestjs/common";

import { RoleGuardModule } from "../../common/guards/role-guard.module";
import { ValidationController } from "./validation.controller";
import { ValidationService } from "./validation.service";

@Module({
  imports: [RoleGuardModule],
  controllers: [ValidationController],
  providers: [ValidationService],
  exports: [ValidationService],
})
export class ValidationModule {}
