import { Injectable } from "@nestjs/common";

import {
  ApplicationNotFoundException,
  ContractNotFoundException,
  ContractVersionMismatchException,
  ForbiddenException,
  SubmissionNotEditableException,
  SubmissionNotReadyException,
} from "../../common/exceptions/app.exceptions";
import { buildContractSnapshots } from "../contract/contract-snapshot";
import { PrismaService } from "../prisma/prisma.service";
import { ValidationService } from "../validation/validation.service";
import { canonicalJson, contractContentHash } from "./contract-content";

@Injectable()
export class SubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validationService: ValidationService,
  ) {}

  async submit(applicationId: string, customerId: string, contractVersion: number) {
    return this.prisma.$transaction(
      async (transaction) => {
        const [application] = await transaction.$queryRaw<{ customerId: string; status: string }[]>`
        SELECT customer_id AS "customerId", status
        FROM loan_applications WHERE id = ${applicationId}::uuid FOR UPDATE
      `;

        if (!application) {
          throw new ApplicationNotFoundException();
        }
        if (application.customerId !== customerId) {
          throw new ForbiddenException();
        }
        if (application.status !== "DRAFT") {
          throw new SubmissionNotEditableException();
        }

        const contract = await transaction.loanContract.findFirst({
          where: { applicationId },
          orderBy: { version: "desc" },
        });
        if (!contract) {
          throw new ContractNotFoundException();
        }
        if (contract.version !== contractVersion) {
          throw new ContractVersionMismatchException();
        }
        if (contract.status !== "DRAFT") {
          throw new SubmissionNotEditableException();
        }

        const evaluation = await this.validationService.evaluate(
          applicationId,
          customerId,
          transaction,
        );
        if (!evaluation.result.valid || !evaluation.product) {
          throw new SubmissionNotReadyException();
        }

        const snapshots = buildContractSnapshots(evaluation);
        if (
          canonicalJson(snapshots.applicationSnapshot) !==
            canonicalJson(contract.applicationSnapshot) ||
          canonicalJson(snapshots.productSnapshot) !== canonicalJson(contract.productSnapshot)
        ) {
          throw new ContractVersionMismatchException();
        }

        const signedAt = new Date();
        const contentHash = contractContentHash({ ...contract, ...snapshots });
        await transaction.loanContract.update({
          where: { id: contract.id },
          data: { ...snapshots, status: "CUSTOMER_SIGNED", signedAt, contentHash },
        });
        await transaction.loanApplication.update({
          where: { id: applicationId },
          data: { status: "SUBMITTED", submittedAt: signedAt },
        });

        return {
          applicationId,
          applicationStatus: "SUBMITTED",
          submittedAt: signedAt.toISOString(),
          contract: {
            id: contract.id,
            version: contract.version,
            status: "CUSTOMER_SIGNED",
            signedAt: signedAt.toISOString(),
            contentHash,
          },
        };
      },
      { timeout: 10_000 },
    );
  }
}
