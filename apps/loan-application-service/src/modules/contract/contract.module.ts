import { Module } from "@nestjs/common";

import { RoleGuardModule } from "../../common/guards/role-guard.module";
import { ValidationModule } from "../validation/validation.module";
import { ContractController } from "./contract.controller";
import { ContractService } from "./contract.service";

@Module({
  imports: [RoleGuardModule, ValidationModule],
  controllers: [ContractController],
  providers: [ContractService],
})
export class ContractModule {}
