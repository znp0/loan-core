import { Module } from "@nestjs/common";

import { CustomerAccessModule } from "../../common/guards/customer-access.module";
import { ValidationController } from "./validation.controller";
import { ValidationService } from "./validation.service";

@Module({
  imports: [CustomerAccessModule],
  controllers: [ValidationController],
  providers: [ValidationService],
  exports: [ValidationService],
})
export class ValidationModule {}
