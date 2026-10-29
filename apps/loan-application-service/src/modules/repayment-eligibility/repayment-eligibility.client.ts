import { Injectable } from "@nestjs/common";

import { DependencyUnavailableException } from "../../common/exceptions/app.exceptions";

@Injectable()
export class RepaymentEligibilityClient {
  async hasActiveLoan(customerId: string): Promise<boolean> {
    const base = process.env.REPAYMENT_SERVICE_URL;
    const token = process.env.REPAYMENT_INTERNAL_TOKEN;

    if (!base || !token) {
      throw new DependencyUnavailableException();
    }

    try {
      const response = await fetch(
        `${base.replace(/\/$/, "")}/api/v1/internal/customers/${customerId}/active-loan`,
        {
          headers: { "X-Internal-Service-Token": token },
          signal: AbortSignal.timeout(3000),
          redirect: "error",
        },
      );

      if (!response.ok) {
        throw new DependencyUnavailableException();
      }

      const body: unknown = await response.json();

      if (
        typeof body !== "object" ||
        body === null ||
        !("hasActiveLoan" in body) ||
        typeof body.hasActiveLoan !== "boolean"
      ) {
        throw new DependencyUnavailableException();
      }

      return body.hasActiveLoan;
    } catch {
      throw new DependencyUnavailableException();
    }
  }
}
