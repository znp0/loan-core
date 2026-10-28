import { Injectable } from "@nestjs/common";

import { ForbiddenException, LoanNotFoundException } from "../../common/exceptions/app.exceptions";
import { PrismaService } from "../prisma/prisma.service";

type Reader = { id: string; role: "CUSTOMER" | "STAFF" };
const CUSTOMER_ROLE = "CUSTOMER";

function money(value: bigint): number {
  const amount = Number(value);

  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError("Repayment amount exceeds the supported integer range.");
  }

  return amount;
}

@Injectable()
export class RepaymentScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async get(loanId: string, reader: Reader) {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      select: { customerId: true },
    });

    if (!loan) {
      throw new LoanNotFoundException();
    }

    if (reader.role === CUSTOMER_ROLE && loan.customerId !== reader.id) {
      throw new ForbiddenException();
    }

    const items = await this.prisma.repaymentInstallment.findMany({
      where: { loanId },
      orderBy: { installmentNumber: "asc" },
    });

    const responseItems = items.map((item) => {
      const principalAmount = money(item.principalAmount);
      const interestAmount = money(item.interestAmount);
      const paidPrincipal = money(item.paidPrincipal);
      const paidInterest = money(item.paidInterest);

      return {
        id: item.id,
        installmentNumber: item.installmentNumber,
        dueDate: item.dueDate.toISOString().slice(0, 10),
        openingPrincipal: money(item.openingPrincipal),
        principalAmount,
        interestAmount,
        totalAmount: money(item.totalAmount),
        paidPrincipal,
        paidInterest,
        outstandingAmount: money(item.totalAmount - item.paidPrincipal - item.paidInterest),
        status: item.status,
      };
    });

    return {
      loanId,
      items: responseItems,
      totalPrincipal: money(items.reduce((sum, item) => sum + item.principalAmount, 0n)),
      totalInterest: money(items.reduce((sum, item) => sum + item.interestAmount, 0n)),
      totalPayable: money(items.reduce((sum, item) => sum + item.totalAmount, 0n)),
    };
  }
}
