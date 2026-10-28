import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { isUUID } from "class-validator";

import { ForbiddenException, UnauthorizedException } from "../exceptions/app.exceptions";

export type AuthenticatedRequest = {
  headers: { cookie?: string };
  user?: { id: string; role: "CUSTOMER" | "STAFF" };
};

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookies = (request.headers.cookie ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.startsWith("access_token="));
    if (cookies.length !== 1) {
      throw new UnauthorizedException();
    }

    let claims: Record<string, unknown>;

    try {
      claims = await this.jwt.verifyAsync<Record<string, unknown>>(
        cookies[0]!.slice("access_token=".length),
        { algorithms: ["HS256"] },
      );
    } catch {
      throw new UnauthorizedException();
    }

    if (
      claims.tokenType !== "access" ||
      typeof claims.sub !== "string" ||
      !isUUID(claims.sub) ||
      typeof claims.exp !== "number" ||
      !Number.isInteger(claims.exp) ||
      claims.exp <= Date.now() / 1000
    ) {
      throw new UnauthorizedException();
    }

    if (claims.role !== "CUSTOMER" && claims.role !== "STAFF") {
      throw new ForbiddenException();
    }

    request.user = { id: claims.sub, role: claims.role };
    return true;
  }
}
