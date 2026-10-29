import { Injectable } from "@nestjs/common";

import {
  AppException,
  ForbiddenException,
  LoanNotFoundException,
} from "../../common/exceptions/app.exceptions";
import type { Payment, Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentClock, vietnamPaymentDate } from "./payment-clock";
import type { CreatePaymentDto, PaymentHistoryDto } from "./payment.dto";

export function paymentResponse(payment: Payment) {
  return {
    id: payment.id,
    loanId: payment.loanId,
    installmentId: payment.installmentId,
    amount: Number(payment.amount),
    principalAmount: Number(payment.principalAmount),
    interestAmount: Number(payment.interestAmount),
    paidAt: payment.paidAt.toISOString(),
  };
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: PaymentClock,
  ) {}

  async pay(loanId: string, customerId: string, input: CreatePaymentDto, key: string) {
    return this.prisma.$transaction(async (tx) => {
      // Every balance-changing operation locks the loan before checking the next installment.
      await tx.$queryRaw`SELECT id FROM loans WHERE id = ${loanId}::uuid FOR UPDATE`;
      const loan = await this.ownedLoan(tx, loanId, { id: customerId, role: "CUSTOMER" });
      const existing = await tx.payment.findUnique({ where: { loanId_key: { loanId, key } } });

      if (existing) {
        if (
          existing.installmentId !== input.installmentId ||
          existing.amount !== BigInt(input.amount)
        ) {
          throw new AppException(
            409,
            "IDEMPOTENCY_CONFLICT",
            "This key was already used for a different payment.",
          );
        }

        return paymentResponse(existing);
      }

      if (loan.status === "CLOSED") {
        throw new AppException(409, "LOAN_CLOSED", "This loan is already closed.");
      }

      const installment = await tx.repaymentInstallment.findFirst({
        where: { loanId, status: { not: "PAID" } },
        orderBy: { installmentNumber: "asc" },
      });

      if (!installment || installment.id !== input.installmentId) {
        throw new AppException(
          409,
          "INSTALLMENT_NOT_PAYABLE",
          "Payment must target the earliest unpaid installment.",
        );
      }

      const paidAt = this.clock.now();

      if (installment.dueDate.toISOString().slice(0, 10) > vietnamPaymentDate(paidAt)) {
        throw new AppException(
          409,
          "INSTALLMENT_NOT_DUE",
          "This installment is not due yet in Asia/Ho_Chi_Minh.",
        );
      }

      const principal = installment.principalAmount - installment.paidPrincipal;
      const interest = installment.interestAmount - installment.paidInterest;

      if (BigInt(input.amount) !== principal + interest) {
        throw new AppException(
          400,
          "PAYMENT_AMOUNT_MISMATCH",
          "Pay the installment's full outstanding amount.",
        );
      }

      const payment = await tx.payment.create({
        data: {
          loanId,
          installmentId: installment.id,
          key,
          amount: BigInt(input.amount),
          principalAmount: principal,
          interestAmount: interest,
          paidAt,
        },
      });

      await tx.repaymentInstallment.update({
        where: { id: installment.id },
        data: {
          paidPrincipal: installment.principalAmount,
          paidInterest: installment.interestAmount,
          status: "PAID",
        },
      });
      const unpaid = await tx.repaymentInstallment.count({
        where: { loanId, status: { not: "PAID" } },
      });

      if (unpaid === 0) {
        await tx.loan.update({
          where: { id: loanId },
          data: { status: "CLOSED", closedAt: paidAt },
        });
      }

      return paymentResponse(payment);
    });
  }

  async history(
    loanId: string,
    reader: { id: string; role: "CUSTOMER" | "STAFF" },
    query: PaymentHistoryDto,
  ) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);

    return this.prisma.$transaction(
      async (tx) => {
        await this.ownedLoan(tx, loanId, reader);
        const [items, total] = await Promise.all([
          tx.payment.findMany({
            where: { loanId },
            orderBy: [{ paidAt: "desc" }, { id: "desc" }],
            skip: (page - 1) * limit,
            take: limit,
          }),
          tx.payment.count({ where: { loanId } }),
        ]);

        return { items: items.map(paymentResponse), page, limit, total };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }

  async get(loanId: string, reader: { id: string; role: "CUSTOMER" | "STAFF" }) {
    return this.prisma.$transaction(
      async (tx) => {
        const loan = await this.ownedLoan(tx, loanId, reader);
        const totals = await tx.repaymentInstallment.aggregate({
          where: { loanId },
          _sum: {
            principalAmount: true,
            interestAmount: true,
            paidPrincipal: true,
            paidInterest: true,
          },
        });
        const principal = totals._sum.principalAmount ?? 0n;
        const interest = totals._sum.interestAmount ?? 0n;
        const paidPrincipal = totals._sum.paidPrincipal ?? 0n;
        const paidInterest = totals._sum.paidInterest ?? 0n;

        return {
          id: loan.id,
          applicationId: loan.applicationId,
          customerId: loan.customerId,
          status: loan.status,
          disbursedAt: loan.disbursedAt?.toISOString() ?? null,
          closedAt: loan.closedAt?.toISOString() ?? null,
          totalPrincipal: Number(principal),
          totalInterest: Number(interest),
          totalPayable: Number(principal + interest),
          paidPrincipal: Number(paidPrincipal),
          paidInterest: Number(paidInterest),
          outstandingPrincipal: Number(principal - paidPrincipal),
          outstandingInterest: Number(interest - paidInterest),
          outstandingAmount: Number(principal + interest - paidPrincipal - paidInterest),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }

  private async ownedLoan(
    tx: Prisma.TransactionClient,
    loanId: string,
    reader: { id: string; role: "CUSTOMER" | "STAFF" },
  ) {
    const loan = await tx.loan.findUnique({ where: { id: loanId } });

    if (!loan) {
      throw new LoanNotFoundException();
    }

    if (reader.role === "CUSTOMER" && loan.customerId !== reader.id) {
      throw new ForbiddenException();
    }

    return loan;
  }
}
