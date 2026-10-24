import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { CustomerAccessGuard } from "./customer-access.guard";

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;

        if (!secret) {
          throw new Error("JWT_SECRET is required for loan application verification.");
        }

        return { secret, verifyOptions: { algorithms: ["HS256"] } };
      },
    }),
  ],
  providers: [CustomerAccessGuard],
  exports: [CustomerAccessGuard, JwtModule],
})
export class CustomerAccessModule {}
