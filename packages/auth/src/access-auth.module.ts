import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { RoleGuard } from "./role.guard";

export function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error(
      "JWT_SECRET must contain at least 32 bytes and match across identity, application, and repayment services.",
    );
  }

  return secret;
}

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({ secret: requireJwtSecret(), verifyOptions: { algorithms: ["HS256"] } }),
    }),
  ],
  providers: [RoleGuard],
  exports: [RoleGuard, JwtModule],
})
export class AccessAuthModule {}
