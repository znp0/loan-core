import { Injectable } from "@nestjs/common";

import {
  ApplicationNotFoundException,
  DisbursementNotFoundException,
  ForbiddenException,
} from "../../common/exceptions/app.exceptions";
import type { AccessRole } from "@repo/auth";

import { PrismaService } from "../prisma/prisma.service";

import { disbursementResponse } from "./disbursement.response";

@Injectable()
export class DisbursementService {
  constructor(private readonly prisma: PrismaService) {}

  async get(applicationId: string, userId: string, role: AccessRole) {
    const application = await this.prisma.loanApplication.findUnique({
      where: { id: applicationId },
      select: { customerId: true },
    });

    if (!application) {
      throw new ApplicationNotFoundException();
    }

    if (role === "CUSTOMER" && application.customerId !== userId) {
      throw new ForbiddenException();
    }

    const disbursement = await this.prisma.$transaction(
      (transaction) =>
        transaction.disbursement.findUnique({
          where: { applicationId },
          omit: { loanInput: true },
          include: { attempts: { orderBy: { attemptNumber: "asc" } } },
        }),
      { isolationLevel: "RepeatableRead" },
    );

    if (!disbursement) {
      throw new DisbursementNotFoundException();
    }

    return disbursementResponse(disbursement);
  }
}
