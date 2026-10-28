import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { requireJwtSecret } from "@repo/auth";

import { PrismaModule } from "../prisma/prisma.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = requireJwtSecret();

        return { secret, signOptions: { expiresIn: "1h", algorithm: "HS256" } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
