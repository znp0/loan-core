import { Injectable } from "@nestjs/common";

export type TransferResult =
  | { status: "SUCCEEDED"; transactionReference: string; processedAt: Date }
  | { status: "FAILED"; processedAt: Date };

@Injectable()
export class SimulatedTransferProvider {
  async transfer(input: {
    disbursementId: string;
    attemptNumber: number;
    amount: bigint;
    accountNumber: string;
    accountHolderName: string;
  }): Promise<TransferResult> {
    // The simulation has no external effect; a rolled-back attempt can reproduce its reference.
    return {
      status: "SUCCEEDED",
      transactionReference: `SIM-${input.disbursementId}-${input.attemptNumber}`,
      processedAt: new Date(),
    };
  }
}
