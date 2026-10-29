import { Injectable } from "@nestjs/common";

@Injectable()
export class PaymentClock {
  now(): Date {
    return new Date();
  }
}

export function vietnamPaymentDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}
