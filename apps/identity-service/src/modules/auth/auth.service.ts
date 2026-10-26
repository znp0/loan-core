import { createHash, randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcrypt";

import {
  PhoneAlreadyExistsException,
  InvalidCredentialsException,
} from "../../common/exceptions/app.exceptions";
import { Prisma, type Customer } from "../../generated/prisma/client";
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
    const { phone, password, fullName, email } = registerDto;

    const existingCustomer = await this.prisma.customer.findUnique({
      where: { phone },
    });

    if (existingCustomer) {
      throw new PhoneAlreadyExistsException();
    }

    const passwordHash = await this.hashPassword(password);

    let customer: Pick<Customer, "id" | "role">;

    try {
      customer = await this.prisma.customer.create({
        data: {
          phone,
          passwordHash,
          fullName,
          email,
          role: "CUSTOMER",
        },
        select: { id: true, role: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const customerWithPhone = await this.prisma.customer.findUnique({
          where: { phone },
          select: { id: true },
        });

        if (customerWithPhone) {
          throw new PhoneAlreadyExistsException();
        }
      }

      throw error;
    }

    return this.issueTokens(customer.id, customer.role);
  }

  async login(loginDto: LoginDto) {
    const { phone, password } = loginDto;

    const customer = await this.prisma.customer.findUnique({
      where: { phone },
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
