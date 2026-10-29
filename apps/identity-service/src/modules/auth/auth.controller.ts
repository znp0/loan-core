import { Body, Controller, HttpCode, Post, Res, UsePipes } from "@nestjs/common";
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";

import { ApiFailureResponses, jsonObject, RequestValidationPipe } from "@repo/http";

import { LoginDto, RegisterDto } from "./auth.dto";
import { AuthService } from "./auth.service";

@Controller("auth")
@ApiTags("Authentication")
@ApiFailureResponses(400, 500, 503)
@UsePipes(
  new RequestValidationPipe({ forbidNonWhitelisted: false, message: "Invalid request input." }),
)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @ApiOperation({
    summary: "Register a customer",
    description:
      "Returns Secure, HttpOnly, SameSite=Strict access_token (15 minutes, path /) and refresh_token (7 days, path /api/v1/auth) cookies. Use HTTPS for browser clients. Unknown input fields are ignored. Email is contact information; phone identifies the account.",
  })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({
    schema: jsonObject({ message: { type: "string", example: "Register successful" } }),
    headers: {
      "Set-Cookie": {
        description: "Two separate Set-Cookie headers containing the access and refresh tokens.",
        schema: { type: "string" },
      },
    },
  })
  @ApiFailureResponses(409)
  async register(@Body() registerDto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.authService.register(registerDto);

    this.setAuthCookies(response, tokens);

    return { message: "Register successful" };
  }

  @Post("login")
  @HttpCode(200)
  @ApiOperation({
    summary: "Sign in a customer",
    description:
      "Sets the same access and refresh cookies as registration. There is no staff sign-in or refresh endpoint.",
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    schema: jsonObject({ message: { type: "string", example: "Login successful" } }),
    headers: {
      "Set-Cookie": {
        description: "Two separate Set-Cookie headers containing the access and refresh tokens.",
        schema: { type: "string" },
      },
    },
  })
  @ApiFailureResponses(401)
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.authService.login(loginDto);

    this.setAuthCookies(response, tokens);

    return { message: "Login successful" };
  }

  private setAuthCookies(
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
