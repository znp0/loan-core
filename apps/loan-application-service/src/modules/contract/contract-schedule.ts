const RATE_SCALE = 10_000n;
const MONTHLY_RATE_DENOMINATOR = 12n * 100n * RATE_SCALE;

export type ContractScheduleItem = {
  installmentNumber: number;
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
};

export type ContractSchedule = {
  items: ContractScheduleItem[];
  totalPrincipal: number;
  totalInterest: number;
  totalPayable: number;
};

function safeNumber(value: bigint): number {
  const result = Number(value);

  if (!Number.isSafeInteger(result)) {
    throw new RangeError("Contract amount exceeds the JSON safe integer range.");
  }

  return result;
}

function scaledRate(value: string): bigint {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,4}))?$/.exec(value);

  if (!match) {
    throw new RangeError("Annual interest rate must be a non-negative decimal with scale 4.");
  }

  const whole = BigInt(match[1]!);
  const fraction = BigInt((match[2] ?? "").padEnd(4, "0"));

  return whole * RATE_SCALE + fraction;
}

export function buildContractSchedule(
  principalAmount: bigint,
  termMonths: number,
  annualInterestRate: string,
): ContractSchedule {
  if (principalAmount <= 0n || !Number.isSafeInteger(termMonths) || termMonths <= 0) {
    throw new RangeError("Contract principal and term must be positive integers.");
  }

  const rate = scaledRate(annualInterestRate);
  const term = BigInt(termMonths);
  const regularPrincipal = principalAmount / term;
  let openingPrincipal = principalAmount;
  let totalInterest = 0n;
  const items: ContractScheduleItem[] = [];

  for (let installmentNumber = 1; installmentNumber <= termMonths; installmentNumber++) {
    const principal = installmentNumber === termMonths ? openingPrincipal : regularPrincipal;
    const interest =
      (openingPrincipal * rate + MONTHLY_RATE_DENOMINATOR / 2n) / MONTHLY_RATE_DENOMINATOR;

    items.push({
      installmentNumber,
      principalAmount: safeNumber(principal),
      interestAmount: safeNumber(interest),
      totalAmount: safeNumber(principal + interest),
    });

    totalInterest += interest;
    openingPrincipal -= principal;
  }

  return {
    items,
    totalPrincipal: safeNumber(principalAmount),
    totalInterest: safeNumber(totalInterest),
    totalPayable: safeNumber(principalAmount + totalInterest),
  };
}
