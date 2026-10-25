import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import {
  ApplicationNotEditableException,
  ApplicationNotFoundException,
  ForbiddenException,
} from "../../common/exceptions/app.exceptions";
import { PrismaService } from "../prisma/prisma.service";
import { IdentityVerificationDto } from "./identity-verification.dto";

@Injectable()
export class IdentityVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(applicationId: string, customerId: string, input: IdentityVerificationDto) {
    const application = await this.prisma.loanApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        customerId: true,
        status: true,
        identityNumber: true,
        fullName: true,
        dateOfBirth: true,
      },
    });

    if (!application) {
      throw new ApplicationNotFoundException();
    }

    if (application.customerId !== customerId) {
      throw new ForbiddenException();
    }

    if (application.status !== "DRAFT") {
      throw new ApplicationNotEditableException();
    }

    const mismatchedFields: string[] = [];
    const normalizeName = (value: string): string => value.trim().toLocaleLowerCase("vi");
    const date = (value: Date | null): string | null => value?.toISOString().slice(0, 10) ?? null;

    if (application.identityNumber?.trim() !== input.identityNumber.trim()) {
      mismatchedFields.push("identityNumber");
    }
    if (
      !application.fullName ||
      normalizeName(application.fullName) !== normalizeName(input.fullName)
    ) {
      mismatchedFields.push("fullName");
    }
    if (date(application.dateOfBirth) !== input.dateOfBirth) {
      mismatchedFields.push("dateOfBirth");
    }
    const status = mismatchedFields.length === 0 ? "PASSED" : "FAILED";
    const record = await this.prisma.identityVerification.create({
      data: {
        id: randomUUID(),
        applicationId,
        status,
        mismatchedFields,
        verifiedAt: new Date(),
      },
    });

    return {
      id: record.id,
      applicationId: record.applicationId,
      status: record.status,
      mismatchedFields: record.mismatchedFields,
      verifiedAt: record.verifiedAt.toISOString(),
    };
  }
}
