import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { isUUID } from "class-validator";

import { ForbiddenException, UnauthorizedException } from "@repo/http";

export type AccessRole = "CUSTOMER" | "STAFF";
export type AuthenticatedUser = { id: string; role: AccessRole };
export type AuthenticatedRequest = {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
};

const ACCESS_ROLES = "access-roles";

export const RequireRoles = (...roles: AccessRole[]) => SetMetadata(ACCESS_ROLES, roles);

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookie = request.headers.cookie;

    if (typeof cookie !== "string") {
      throw new UnauthorizedException();
    }

    const cookies = cookie
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.startsWith("access_token="));

    if (cookies.length !== 1 || !cookies[0]) {
      throw new UnauthorizedException();
    }

    const token = cookies[0].slice("access_token=".length);
    let claims: unknown;

    try {
      claims = await this.jwt.verifyAsync(token, { algorithms: ["HS256"] });
    } catch {
      throw new UnauthorizedException();
    }

    if (
      typeof claims !== "object" ||
      claims === null ||
      Array.isArray(claims) ||
      !("tokenType" in claims) ||
      claims.tokenType !== "access" ||
      !("sub" in claims) ||
      typeof claims.sub !== "string" ||
      !isUUID(claims.sub) ||
      !("exp" in claims) ||
      typeof claims.exp !== "number" ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp <= Date.now() / 1000 ||
      !("role" in claims) ||
      typeof claims.role !== "string"
    ) {
      throw new UnauthorizedException();
    }

    if (claims.role !== "CUSTOMER" && claims.role !== "STAFF") {
      throw new ForbiddenException();
    }

    const allowedRoles = this.reflector.getAllAndOverride<AccessRole[]>(ACCESS_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);

    // A guarded route must explicitly declare its permitted roles.
    if (!allowedRoles?.includes(claims.role)) {
      throw new ForbiddenException();
    }

    request.user = { id: claims.sub, role: claims.role };

    return true;
  }
}
