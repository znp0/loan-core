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
    const application = await this.prisma.loan_applications.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        customer_id: true,
        status: true,
        identity_number: true,
        full_name: true,
        date_of_birth: true,
        identity_expiry_date: true,
      },
    });

    if (!application) {
      throw new ApplicationNotFoundException();
    }

    if (application.customer_id !== customerId) {
      throw new ForbiddenException();
    }

    if (application.status !== "DRAFT") {
      throw new ApplicationNotEditableException();
    }

    const mismatchedFields: string[] = [];
    const normalizeName = (value: string): string => value.trim().toLocaleLowerCase("vi");
    const date = (value: Date | null): string | null => value?.toISOString().slice(0, 10) ?? null;

    if (application.identity_number?.trim() !== input.identityNumber.trim()) {
      mismatchedFields.push("identityNumber");
    }
    if (
      !application.full_name ||
      normalizeName(application.full_name) !== normalizeName(input.fullName)
    ) {
      mismatchedFields.push("fullName");
    }
    if (date(application.date_of_birth) !== input.dateOfBirth) {
      mismatchedFields.push("dateOfBirth");
    }
    if (date(application.identity_expiry_date) !== input.identityExpiryDate) {
      mismatchedFields.push("identityExpiryDate");
    }

    const status = mismatchedFields.length === 0 ? "PASSED" : "FAILED";
    const record = await this.prisma.identity_verifications.create({
      data: {
        id: randomUUID(),
        application_id: applicationId,
        status,
        mismatched_fields: mismatchedFields,
        verified_at: new Date(),
      },
    });

    return {
      id: record.id,
      applicationId: record.application_id,
      status: record.status,
      mismatchedFields: record.mismatched_fields,
      verifiedAt: record.verified_at.toISOString(),
    };
  }
}
