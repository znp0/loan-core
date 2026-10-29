import { Injectable } from "@nestjs/common";

import {
  AppException,
  ApplicationNotFoundException,
  DependencyUnavailableException,
} from "../../common/exceptions/app.exceptions";
import { Prisma, type LoanContract } from "../../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { contractContentHash } from "../submission/contract-content";
import { disbursementResponse } from "./disbursement.response";
import { RepaymentLoanClient, type FrozenLoanInput } from "./repayment-loan.client";
import { SimulatedTransferProvider } from "./simulated-transfer.provider";

const includeAttempts = { attempts: { orderBy: { attemptNumber: "asc" as const } } };

@Injectable()
export class DisbursementActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transfers: SimulatedTransferProvider,
    private readonly loans: RepaymentLoanClient,
  ) {}

  async execute(applicationId: string, key: string) {
    const prepared = await this.prepare(applicationId, key);

    if ("result" in prepared) {
      return prepared.result;
    }

    // Transfer success is committed before crossing the service boundary. A retry reuses it.
    const loanId = await this.loans.create(prepared.input);

    return this.prisma.$transaction(async (tx) => {
      await this.lockApplication(tx, applicationId);
      const disbursement = await tx.disbursement.findUniqueOrThrow({
        where: { applicationId },
        include: includeAttempts,
      });

      if (disbursement.loanId && disbursement.loanId !== loanId) {
        throw new AppException(
          409,
          "DISBURSEMENT_LOAN_CONFLICT",
          "The confirmed loan does not match this disbursement.",
        );
      }

      const completed = await tx.disbursement.update({
        where: { id: disbursement.id },
        data: { status: "SUCCEEDED", loanId, completedAt: disbursement.completedAt ?? new Date() },
        include: includeAttempts,
      });

      await tx.loanContract.update({
        where: { id: prepared.input.contractId },
        data: { status: "EFFECTIVE" },
      });
      const result = disbursementResponse(completed);

      await tx.disbursementOperation.updateMany({
        where: { disbursementId: completed.id, result: { equals: Prisma.DbNull } },
        data: { result },
      });

      return result;
    });
  }

  private async prepare(applicationId: string, key: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const application = await this.lockApplication(tx, applicationId);

        if (application.status !== "APPROVED") {
          throw new AppException(
            409,
            "DISBURSEMENT_NOT_READY",
            "Disbursement requires an approved application and a customer-signed contract.",
          );
        }

        const contract = await tx.loanContract.findFirst({
          where: { applicationId },
          orderBy: { version: "desc" },
        });

        if (
          !contract ||
          !["CUSTOMER_SIGNED", "EFFECTIVE"].includes(contract.status) ||
          !contract.signedAt ||
          !contract.contentHash ||
          contract.contentHash !== contractContentHash(contract)
        ) {
          throw new AppException(
            409,
            "DISBURSEMENT_NOT_READY",
            "A valid customer-signed contract is required.",
          );
        }

        const frozen = this.freeze(contract, application.customerId);
        let disbursement = await tx.disbursement.findUnique({
          where: { applicationId },
          include: includeAttempts,
        });

        if (!disbursement) {
          disbursement = await tx.disbursement.create({
            data: {
              applicationId,
              amount: contract.principalAmount,
              accountNumber: frozen.accountNumber,
              accountHolderName: frozen.accountHolderName,
              loanInput: frozen.input,
            },
            include: includeAttempts,
          });
        }

        if (!disbursement.loanInput || JSON.stringify(disbursement.loanInput) === "null") {
          throw new AppException(
            409,
            "DISBURSEMENT_STATE_CONFLICT",
            "The disbursement lacks frozen loan input; investigate its transfer state before retrying.",
          );
        }

        const operation = await tx.disbursementOperation.findUnique({
          where: { disbursementId_key: { disbursementId: disbursement.id, key } },
        });

        if (operation && operation.requestHash !== contract.contentHash) {
          throw new AppException(
            409,
            "IDEMPOTENCY_CONFLICT",
            "This key was already used with different contract content.",
          );
        }

        if (operation?.result !== null && operation?.result !== undefined) {
          return { result: operation.result };
        }

        if (!operation) {
          await tx.disbursementOperation.create({
            data: { disbursementId: disbursement.id, key, requestHash: contract.contentHash },
          });
        }

        if (disbursement.status === "SUCCEEDED") {
          const result = disbursementResponse(disbursement);

          await tx.disbursementOperation.update({
            where: { disbursementId_key: { disbursementId: disbursement.id, key } },
            data: { result },
          });

          return { result };
        }

        let success = disbursement.attempts.find((attempt) => attempt.status === "SUCCEEDED");

        if (!success) {
          const attemptNumber = disbursement.attempts.length + 1;
          const transfer = await this.transfers.transfer({
            disbursementId: disbursement.id,
            attemptNumber,
            amount: disbursement.amount,
            accountNumber: disbursement.accountNumber,
            accountHolderName: disbursement.accountHolderName,
          });
          const attempt = await tx.disbursementAttempt.create({
            data: {
              disbursementId: disbursement.id,
              attemptNumber,
              status: transfer.status,
              processedAt: transfer.processedAt,
              transactionReference:
                transfer.status === "SUCCEEDED" ? transfer.transactionReference : null,
              failureCode: transfer.status === "FAILED" ? "SIMULATED_TRANSFER_FAILED" : null,
              failureMessage:
                transfer.status === "FAILED"
                  ? "The simulated transfer failed. Retry with a new Idempotency-Key."
                  : null,
            },
          });
          const updated = await tx.disbursement.update({
            where: { id: disbursement.id },
            data: { status: transfer.status === "SUCCEEDED" ? "PROCESSING" : "FAILED" },
            include: includeAttempts,
          });

          if (transfer.status === "FAILED") {
            const result = disbursementResponse(updated);

            await tx.disbursementOperation.update({
              where: { disbursementId_key: { disbursementId: disbursement.id, key } },
              data: { result },
            });

            return { result };
          }

          success = attempt;
        }

        const input = disbursement.loanInput as unknown as FrozenLoanInput;

        if (
          input.contractId !== contract.id ||
          input.applicationId !== applicationId ||
          input.customerId !== application.customerId
        ) {
          throw new DependencyUnavailableException();
        }

        return { input: { ...input, disbursedAt: success.processedAt.toISOString() } };
      },
      { timeout: 15000 },
    );
  }

  private async lockApplication(tx: Prisma.TransactionClient, applicationId: string) {
    await tx.$queryRaw`SELECT id FROM loan_applications WHERE id = ${applicationId}::uuid FOR UPDATE`;
    const application = await tx.loanApplication.findUnique({ where: { id: applicationId } });

    if (!application) {
      throw new ApplicationNotFoundException();
    }

    return application;
  }

  private freeze(contract: LoanContract, customerId: string) {
    const snapshot = contract.applicationSnapshot as Record<string, Prisma.JsonValue>;
    const account = snapshot.disbursementAccount as Record<string, Prisma.JsonValue> | undefined;

    if (
      !account ||
      typeof account.accountNumber !== "string" ||
      !account.accountNumber.trim() ||
      typeof account.accountHolderName !== "string" ||
      !account.accountHolderName.trim() ||
      account.verificationStatus !== "VERIFIED" ||
      snapshot.customerId !== customerId ||
      !Array.isArray(contract.schedulePreview) ||
      contract.schedulePreview.length !== contract.termMonths
    ) {
      throw new AppException(
        409,
        "DISBURSEMENT_NOT_READY",
        "The signed contract must contain a verified recipient and frozen schedule.",
      );
    }

    const input: FrozenLoanInput = {
      applicationId: contract.applicationId,
      customerId,
      contractId: contract.id,
      principalAmount: Number(contract.principalAmount),
      totalInterest: Number(contract.totalInterest),
      totalPayable: Number(contract.totalPayable),
      schedule: contract.schedulePreview as unknown as FrozenLoanInput["schedule"],
    };

    return {
      input,
      accountNumber: account.accountNumber,
      accountHolderName: account.accountHolderName,
    };
  }
}
