import { createHash, timingSafeEqual } from "node:crypto";

import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

import { UnauthorizedException } from "../exceptions/app.exceptions";

@Injectable()
export class ProductInternalTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const token = request.headers["x-internal-service-token"];
    const expectedToken = process.env.PRODUCT_INTERNAL_TOKEN;

    if (typeof token !== "string" || !token || !expectedToken) {
      throw new UnauthorizedException();
    }

    const tokenHash = createHash("sha256").update(token).digest();
    const expectedHash = createHash("sha256").update(expectedToken).digest();

    if (!timingSafeEqual(tokenHash, expectedHash)) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
