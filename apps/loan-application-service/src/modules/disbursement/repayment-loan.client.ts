import { Injectable } from "@nestjs/common";
import { isUUID } from "class-validator";

import { DependencyUnavailableException } from "../../common/exceptions/app.exceptions";

export type LoanSnapshot = {
  applicationId: string;
  customerId: string;
  contractId: string;
  principalAmount: number;
  totalInterest: number;
  totalPayable: number;
  schedule: {
    installmentNumber: number;
    principalAmount: number;
    interestAmount: number;
    totalAmount: number;
  }[];
};

@Injectable()
export class RepaymentLoanClient {
  async create(input: LoanSnapshot & { disbursedAt: string }): Promise<string> {
    const base = process.env.REPAYMENT_SERVICE_URL;
    const token = process.env.REPAYMENT_INTERNAL_TOKEN;

    if (!base || !token) {
      throw new DependencyUnavailableException();
    }

    try {
      const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/internal/loans`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Service-Token": token },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });

      if (!response.ok) {
        throw new DependencyUnavailableException();
      }

      const body = (await response.json()) as Record<string, unknown>;

      if (
        typeof body.id !== "string" ||
        !isUUID(body.id) ||
        body.applicationId !== input.applicationId ||
        body.customerId !== input.customerId ||
        body.contractId !== input.contractId ||
        body.disbursedAt !== input.disbursedAt ||
        !["ACTIVE", "OVERDUE", "CLOSED"].includes(String(body.status))
      ) {
        throw new DependencyUnavailableException();
      }

      return body.id;
    } catch {
      throw new DependencyUnavailableException();
    }
  }
}
