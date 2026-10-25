import { Module } from "@nestjs/common";

import { CustomerAccessModule } from "../../common/guards/customer-access.module";
import { ValidationModule } from "../validation/validation.module";
import { ContractController } from "./contract.controller";
import { ContractService } from "./contract.service";

@Module({
  imports: [CustomerAccessModule, ValidationModule],
  controllers: [ContractController],
  providers: [ContractService],
})
export class ContractModule {}
