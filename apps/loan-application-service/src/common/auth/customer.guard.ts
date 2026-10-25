import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { isUUID } from "class-validator";

import { AppException, forbidden } from "../exceptions/app.exceptions";

export interface CustomerRequest extends Request {
  customerId: string;
}

@Injectable()
export class CustomerGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CustomerRequest>();
    const cookies = (request.headers.cookie ?? "").split(";").map((value) => value.trim());
    const token = cookies.find((value) => value.startsWith("access_token="))?.slice(13);
    let payload: { sub?: unknown; role?: unknown; tokenType?: unknown; exp?: unknown };
    try {
      if (!token) throw new Error("Missing access cookie");
      payload = await this.jwt.verifyAsync(token, { algorithms: ["HS256"] });
      if (
        payload.tokenType !== "access" ||
        typeof payload.sub !== "string" ||
        !isUUID(payload.sub) ||
        typeof payload.exp !== "number"
      ) {
        throw new Error("Invalid access claims");
      }
    } catch {
      throw new AppException(
        401,
        "UNAUTHORIZED",
        "Authentication is required to access this resource.",
      );
    }
    if (payload.role !== "CUSTOMER") throw forbidden();
    request.customerId = payload.sub as string;
    return true;
  }
}
