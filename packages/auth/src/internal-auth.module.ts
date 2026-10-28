import { Module } from "@nestjs/common";

import { InternalTokenGuard } from "./internal-token.guard";

@Module({ providers: [InternalTokenGuard], exports: [InternalTokenGuard] })
export class InternalAuthModule {}
