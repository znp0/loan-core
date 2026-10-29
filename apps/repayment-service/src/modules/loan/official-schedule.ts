import { ValidationException } from "../../common/exceptions/app.exceptions";
import type { CreateLoanDto } from "./create-loan.dto";

type FrozenInstallment = {
  installmentNumber: number;
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
};

export function officialSchedule(input: CreateLoanDto) {
  const items: FrozenInstallment[] = [];
  let principal = 0n;
  let interest = 0n;

  for (const [index, value] of input.schedule.entries()) {
    const item = value as FrozenInstallment;
    const fields = ["installmentNumber", "principalAmount", "interestAmount", "totalAmount"];

    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      Object.keys(value).length !== fields.length ||
      !fields.every((field) => Object.hasOwn(value, field)) ||
      item.installmentNumber !== index + 1 ||
      ![item.principalAmount, item.interestAmount, item.totalAmount].every(
        (amount) => Number.isSafeInteger(amount) && amount >= 0,
      ) ||
      BigInt(item.totalAmount) !== BigInt(item.principalAmount) + BigInt(item.interestAmount)
    ) {
      throw new ValidationException([
        {
          field: `schedule.${index}`,
          message:
            "Provide ordered installments with exact non-negative integer amounts and matching totals.",
        },
      ]);
    }

    principal += BigInt(item.principalAmount);
    interest += BigInt(item.interestAmount);
    items.push({
      installmentNumber: item.installmentNumber,
      principalAmount: item.principalAmount,
      interestAmount: item.interestAmount,
      totalAmount: item.totalAmount,
    });
  }

  if (
    principal !== BigInt(input.principalAmount) ||
    interest !== BigInt(input.totalInterest) ||
    principal + interest !== BigInt(input.totalPayable)
  ) {
    throw new ValidationException([
      { field: "schedule", message: "Installment sums must match the frozen contract totals." },
    ]);
  }

  return items;
}

export function installmentDueDate(disbursedAt: Date, offset: number): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(disbursedAt);
  const part = (type: string) => Number(parts.find((value) => value.type === type)!.value);
  const month = part("month") - 1 + offset;
  const year = part("year");
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  // Each due date is anchored to the transfer day, so February does not shift later months.
  return new Date(Date.UTC(year, month, Math.min(part("day"), lastDay)));
}
