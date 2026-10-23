import { createHash, randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcrypt";

import {
  PhoneAlreadyExistsException,
  InvalidCredentialsException,
} from "../common/exceptions/app.exceptions";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto, RegisterDto } from "./auth.dto";

function passwordInput(password: string): string {
  return createHash("sha256").update(password).digest("base64");
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { phone, password, fullName } = registerDto;
    const normalizedPhone = phone.trim();
    const existingCustomer = await this.prisma.customer.findUnique({
      where: { phone: normalizedPhone },
    });

    if (existingCustomer) {
      throw new PhoneAlreadyExistsException();
    }

    const passwordHash = await this.hashPassword(password);

    const customer = await this.prisma.customer.create({
      data: { phone: normalizedPhone, passwordHash, fullName, role: "CUSTOMER" },
      select: { id: true, role: true },
    });

    return this.issueTokens(customer.id, customer.role);
  }

  async login(loginDto: LoginDto) {
    const { phone, password } = loginDto;
    const customer = await this.prisma.customer.findUnique({
      where: { phone: phone.trim() },
    });

    if (!customer || !customer.passwordHash) {
      throw new InvalidCredentialsException();
    }

    const isPasswordValid = await compare(passwordInput(password), customer.passwordHash);

    if (!isPasswordValid) {
      throw new InvalidCredentialsException();
    }

    return this.issueTokens(customer.id, customer.role);
  }

  private async hashPassword(password: string): Promise<string> {
    return hash(passwordInput(password), 12);
  }

  private async issueTokens(id: string, role: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: id, role, tokenType: "access" },
      { expiresIn: "15m", jwtid: randomUUID() },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: id, tokenType: "refresh" },
      { expiresIn: "7d", jwtid: randomUUID() },
    );

    return { accessToken, refreshToken };
  }
}
