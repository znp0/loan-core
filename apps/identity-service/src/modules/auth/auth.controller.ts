import { Body, Controller, HttpCode, Post, Res, UsePipes } from "@nestjs/common";
import type { Response } from "express";

import { RequestValidationPipe } from "../../common/pipes/request-validation.pipe";
import { LoginDto, RegisterDto } from "./auth.dto";
import { AuthService } from "./auth.service";

@Controller("auth")
@UsePipes(new RequestValidationPipe())
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  async register(@Body() registerDto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.auth.register(registerDto);

    this.setCookies(response, tokens);

    return { message: "Register successful" };
  }

  @Post("login")
  @HttpCode(200)
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.auth.login(loginDto);

    this.setCookies(response, tokens);

    return { message: "Login successful" };
  }

  private setCookies(
    response: Response,
    tokens: { accessToken: string; refreshToken: string },
  ): void {
    const options = { httpOnly: true, secure: true, sameSite: "strict" as const };

    response.cookie("access_token", tokens.accessToken, {
      ...options,
      path: "/",
      maxAge: 900_000,
    });
    response.cookie("refresh_token", tokens.refreshToken, {
      ...options,
      path: "/api/v1/auth",
      maxAge: 604_800_000,
    });
  }
}
