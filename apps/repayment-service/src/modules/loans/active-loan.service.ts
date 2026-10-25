import { Injectable } from "@nestjs/common";

import { LoanStatus } from "../../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ActiveLoanService {
  constructor(private readonly prisma: PrismaService) {}

  async hasActiveLoan(customerId: string): Promise<boolean> {
    const loan = await this.prisma.loan.findFirst({
      where: { customerId, status: { in: [LoanStatus.ACTIVE, LoanStatus.OVERDUE] } },
      select: { id: true },
    });

    return loan !== null;
  }
}
