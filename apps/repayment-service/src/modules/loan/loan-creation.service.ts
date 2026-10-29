import { createHash } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/exceptions/app.exceptions";
import { PrismaService } from "../prisma/prisma.service";
import { CreateLoanDto } from "./create-loan.dto";
import { installmentDueDate, officialSchedule } from "./official-schedule";

@Injectable()
export class LoanCreationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateLoanDto) {
    const schedule = officialSchedule(input);
    const disbursedAt = new Date(input.disbursedAt);
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          applicationId: input.applicationId,
          customerId: input.customerId,
          contractId: input.contractId,
          disbursedAt: disbursedAt.toISOString(),
          principalAmount: input.principalAmount,
          totalInterest: input.totalInterest,
          totalPayable: input.totalPayable,
          schedule,
        }),
      )
      .digest("hex");

    return this.prisma.$transaction(async (tx) => {
      // Serialize both duplicate application requests and competing loans for one customer.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`loan-application:${input.applicationId}`}, 0))::text`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`loan-customer:${input.customerId}`}, 0))::text`;

      const existing = await tx.loan.findUnique({ where: { applicationId: input.applicationId } });

      if (existing) {
        if (existing.creationHash !== hash) {
          throw new AppException(
            409,
            "LOAN_INPUT_CONFLICT",
            "This application already has a loan with different frozen terms.",
          );
        }

        return this.response(existing);
      }

      const active = await tx.loan.findFirst({
        where: { customerId: input.customerId, status: { in: ["ACTIVE", "OVERDUE"] } },
      });

      if (active) {
        throw new AppException(
          409,
          "ACTIVE_LOAN_EXISTS",
          "The customer already has an unpaid loan.",
        );
      }

      let opening = BigInt(input.principalAmount);
      const installments = schedule.map((item) => {
        const openingPrincipal = opening;

        opening -= BigInt(item.principalAmount);

        return {
          installmentNumber: item.installmentNumber,
          dueDate: installmentDueDate(disbursedAt, item.installmentNumber),
          openingPrincipal,
          principalAmount: BigInt(item.principalAmount),
          interestAmount: BigInt(item.interestAmount),
          totalAmount: BigInt(item.totalAmount),
          status: item.totalAmount === 0 ? ("PAID" as const) : ("PENDING" as const),
        };
      });
      const loan = await tx.loan.create({
        data: {
          applicationId: input.applicationId,
          customerId: input.customerId,
          contractId: input.contractId,
          creationHash: hash,
          disbursedAt,
          installments: { create: installments },
        },
      });

      return this.response(loan);
    });
  }

  private response(loan: {
    id: string;
    applicationId: string;
    customerId: string;
    contractId: string | null;
    status: string;
    disbursedAt: Date | null;
  }) {
    return {
      id: loan.id,
      applicationId: loan.applicationId,
      customerId: loan.customerId,
      contractId: loan.contractId,
      status: loan.status,
      disbursedAt: loan.disbursedAt?.toISOString() ?? null,
    };
  }
}
