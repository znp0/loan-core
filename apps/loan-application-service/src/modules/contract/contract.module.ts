import { Module } from "@nestjs/common";

import { AccessAuthModule } from "@repo/auth";

import { ValidationModule } from "../validation/validation.module";
import { ContractController } from "./contract.controller";
import { ContractService } from "./contract.service";

@Module({
  imports: [AccessAuthModule, ValidationModule],
  controllers: [ContractController],
  providers: [ContractService],
})
export class ContractModule {}
