import { createHash } from "node:crypto";

import { Prisma, type LoanContract } from "../../generated/prisma/client";

function compareText(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function normalize(value: unknown, field = ""): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => normalize(item));

    if (field === "contacts" || field === "documents") {
      const records = items as Record<string, string>[];

      records.sort((a, b) => {
        const aKey = field === "contacts" ? a.phone! : `${a.type}:${a.id}`;
        const bKey = field === "contacts" ? b.phone! : `${b.type}:${b.id}`;

        return compareText(aKey, bKey);
      });
    } else if (field === "allowedTerms") {
      items.sort((a, b) => (a as number) - (b as number));
    } else if (field === "requiredDocumentTypes") {
      items.sort();
    }

    return items;
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => compareText(a, b))
        .map(([key, item]) => [key, normalize(item, key)]),
    );
  }

  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function contractContentHash(contract: LoanContract): string {
  const content = {
    formatVersion: 1,
    id: contract.id,
    applicationId: contract.applicationId,
    contractNumber: contract.contractNumber,
    version: contract.version,
    applicationSnapshot: contract.applicationSnapshot,
    productSnapshot: contract.productSnapshot,
    terms: {
      principalAmount: contract.principalAmount.toString(),
      currency: contract.currency,
      termMonths: contract.termMonths,
      annualInterestRate: new Prisma.Decimal(contract.annualInterestRate.toString()).toFixed(4),
      interestCalculationMethod: contract.interestCalculationMethod,
    },
    schedulePreview: contract.schedulePreview,
    totalPrincipal: contract.principalAmount.toString(),
    totalInterest: contract.totalInterest.toString(),
    totalPayable: contract.totalPayable.toString(),
  };

  return createHash("sha256").update(canonicalJson(content), "utf8").digest("hex");
}
