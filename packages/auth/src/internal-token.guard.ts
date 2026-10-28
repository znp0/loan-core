import { createHash, timingSafeEqual } from "node:crypto";

import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { UnauthorizedException } from "@repo/http";

type InternalCredential = "PRODUCT_INTERNAL_TOKEN" | "REPAYMENT_INTERNAL_TOKEN";
const INTERNAL_CREDENTIAL = "internal-credential";

export const RequireInternalToken = (credential: InternalCredential) =>
  SetMetadata(INTERNAL_CREDENTIAL, credential);

export function internalTokensMatch(supplied: unknown, expected: string | undefined): boolean {
  if (typeof supplied !== "string" || !supplied || !expected) {
    return false;
  }

  const suppliedHash = createHash("sha256").update(supplied).digest();
  const expectedHash = createHash("sha256").update(expected).digest();

  return timingSafeEqual(suppliedHash, expectedHash);
}

@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      rawHeaders?: string[];
    }>();
    const credential = this.reflector.getAllAndOverride<InternalCredential>(INTERNAL_CREDENTIAL, [
      context.getHandler(),
      context.getClass(),
    ]);
    const expected = credential ? process.env[credential] : undefined;
    const supplied = request.headers["x-internal-service-token"];
    const rawHeaders = request.rawHeaders ?? [];
    let occurrences = 0;

    for (let index = 0; index < rawHeaders.length; index += 2) {
      if (rawHeaders[index]?.toLowerCase() === "x-internal-service-token") {
        occurrences += 1;
      }
    }

    if (occurrences > 1 || !internalTokensMatch(supplied, expected)) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
