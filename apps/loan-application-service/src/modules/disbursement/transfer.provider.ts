import { Injectable } from "@nestjs/common";

export type TransferResult =
  | { status: "SUCCEEDED"; transactionReference: string; processedAt: Date }
  | { status: "FAILED"; processedAt: Date };

@Injectable()
export class TransferProvider {
  async transfer(input: {
    disbursementId: string;
    attemptNumber: number;
    amount: bigint;
    accountNumber: string;
    accountHolderName: string;
  }): Promise<TransferResult> {
    // Keep the reference stable when the same attempt is retried.
    return {
      status: "SUCCEEDED",
      transactionReference: `TRF-${input.disbursementId}-${input.attemptNumber}`,
      processedAt: new Date(),
    };
  }
}
