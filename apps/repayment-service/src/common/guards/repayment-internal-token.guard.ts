import { createHash, timingSafeEqual } from "node:crypto";

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";

@Injectable()
export class RepaymentInternalTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const token = request.headers["x-internal-service-token"];
    const expectedToken = process.env.REPAYMENT_INTERNAL_TOKEN;

    if (typeof token !== "string" || !token || !expectedToken) {
      throw new UnauthorizedException();
    }

    const suppliedHash = createHash("sha256").update(token).digest();
    const expectedHash = createHash("sha256").update(expectedToken).digest();

    if (!timingSafeEqual(suppliedHash, expectedHash)) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
