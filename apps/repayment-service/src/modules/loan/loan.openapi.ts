import type { SchemaObject } from "@nestjs/swagger";

import { jsonArray, jsonObject } from "@repo/http";

const uuid: SchemaObject = { type: "string", format: "uuid" };
const timestamp: SchemaObject = { type: "string", format: "date-time" };
const money: SchemaObject = {
  type: "integer",
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
  description: "Amount in VND.",
};
const loanStatus: SchemaObject = { type: "string", enum: ["ACTIVE", "OVERDUE", "CLOSED"] };

export const createdLoanSchema = jsonObject({
  id: uuid,
  applicationId: uuid,
  customerId: uuid,
  contractId: { ...uuid, nullable: true },
  status: loanStatus,
  disbursedAt: { ...timestamp, nullable: true },
});

export const loanSchema = jsonObject({
  id: uuid,
  applicationId: uuid,
  customerId: uuid,
  status: loanStatus,
  disbursedAt: { ...timestamp, nullable: true },
  closedAt: { ...timestamp, nullable: true },
  totalPrincipal: money,
  totalInterest: money,
  totalPayable: money,
  paidPrincipal: money,
  paidInterest: money,
  outstandingPrincipal: money,
  outstandingInterest: money,
  outstandingAmount: money,
});

export const paymentSchema = jsonObject({
  id: uuid,
  loanId: uuid,
  installmentId: uuid,
  amount: money,
  principalAmount: money,
  interestAmount: money,
  paidAt: timestamp,
});

export const historySchema = jsonObject({
  items: jsonArray(paymentSchema),
  page: { type: "integer", minimum: 1 },
  limit: { type: "integer", minimum: 1, maximum: 100 },
  total: { type: "integer" },
});

export const scheduleSchema = jsonObject({
  loanId: uuid,
  items: jsonArray(
    jsonObject({
      id: uuid,
      installmentNumber: { type: "integer", minimum: 1 },
      dueDate: { type: "string", format: "date" },
      openingPrincipal: money,
      principalAmount: money,
      interestAmount: money,
      totalAmount: money,
      paidPrincipal: money,
      paidInterest: money,
      outstandingAmount: money,
      status: { type: "string", enum: ["PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE"] },
    }),
  ),
  totalPrincipal: money,
  totalInterest: money,
  totalPayable: money,
});
