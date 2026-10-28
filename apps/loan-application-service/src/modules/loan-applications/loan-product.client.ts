import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/exceptions/app.exceptions";

export interface LoanProductTerms {
  id: string;
  status: "ACTIVE" | "INACTIVE";
  minAmount: number;
  maxAmount: number;
  allowedTerms: number[];
  requiredDocumentTypes: string[];
}

@Injectable()
export class LoanProductClient {
  async getById(productId: string): Promise<LoanProductTerms> {
    try {
      const baseUrl = process.env.LOAN_PRODUCT_SERVICE_URL ?? "http://127.0.0.1:3002";
      const token = process.env.PRODUCT_INTERNAL_TOKEN;

      if (!token) {
        throw new Error("Service token is not configured");
      }

      const response = await fetch(`${baseUrl}/api/v1/internal/loan-products/${productId}`, {
        headers: { "x-internal-service-token": token },
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });

      if (response.status === 404) {
        throw new AppException(
          404,
          "PRODUCT_NOT_FOUND",
          "The requested loan product was not found.",
        );
      }

      if (!response.ok) {
        throw new Error("Product service unavailable");
      }

      const product: unknown = await response.json();

      if (!isLoanProductTerms(product) || product.id !== productId) {
        throw new Error("Invalid product response");
      }

      return product;
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      throw new AppException(
        503,
        "PRODUCT_SERVICE_UNAVAILABLE",
        "Loan product service temporarily unavailable.",
      );
    }
  }
}

function isLoanProductTerms(value: unknown): value is LoanProductTerms {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "status" in value &&
    ["ACTIVE", "INACTIVE"].includes(String(value.status)) &&
    "minAmount" in value &&
    Number.isSafeInteger(value.minAmount) &&
    "maxAmount" in value &&
    Number.isSafeInteger(value.maxAmount) &&
    "allowedTerms" in value &&
    Array.isArray(value.allowedTerms) &&
    value.allowedTerms.every(Number.isSafeInteger) &&
    "requiredDocumentTypes" in value &&
    Array.isArray(value.requiredDocumentTypes) &&
    value.requiredDocumentTypes.every((type: unknown) => typeof type === "string")
  );
}
