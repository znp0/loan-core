import type { Prisma } from "../../generated/prisma/client";

type DisbursementRecord = Omit<
  Prisma.DisbursementGetPayload<{ include: { attempts: true } }>,
  "loanInput"
>;
const VISIBLE_ACCOUNT_NUMBER_DIGITS = 4;

export function disbursementResponse(disbursement: DisbursementRecord) {
  const amount = Number(disbursement.amount);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RangeError("Disbursement amount is outside the supported integer range.");
  }

  const account = disbursement.accountNumber;
  const maskedAccountNumber =
    account.length <= VISIBLE_ACCOUNT_NUMBER_DIGITS
      ? "*".repeat(account.length)
      : `${"*".repeat(account.length - VISIBLE_ACCOUNT_NUMBER_DIGITS)}${account.slice(-VISIBLE_ACCOUNT_NUMBER_DIGITS)}`;

  return {
    id: disbursement.id,
    applicationId: disbursement.applicationId,
    amount,
    currency: disbursement.currency,
    destinationAccount: {
      maskedAccountNumber,
      accountHolderName: disbursement.accountHolderName,
    },
    status: disbursement.status,
    attempts: disbursement.attempts.map((attempt) => ({
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      transactionReference: attempt.transactionReference,
      failureCode: attempt.failureCode,
      failureMessage: attempt.failureMessage,
      processedAt: attempt.processedAt.toISOString(),
    })),
    loanId: disbursement.status === "SUCCEEDED" ? disbursement.loanId : null,
    createdAt: disbursement.createdAt.toISOString(),
    completedAt: disbursement.completedAt?.toISOString() ?? null,
  };
}
