import { randomUUID } from "node:crypto";
import { basename } from "node:path";

import { Injectable } from "@nestjs/common";

import {
  AppException,
  ValidationException,
  forbiddenException,
  applicationNotEditableException,
} from "../../common/exceptions/app.exceptions";
import type { Prisma } from "../../generated/prisma/client";
import { VerificationStatus } from "../../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";
import { ApplicationEligibilityPolicy } from "./application-eligibility.policy";
import { applicationInclude, applicationResponse, documentResponse } from "./application.response";
import { DocumentStorage } from "./document.storage";
import { LoanProductClient, type LoanProductTerms } from "./loan-product.client";
import { MAX_DOCUMENT_SIZE, REQUIRED_CONTACT_COUNT } from "./loan-applications.constants";
import {
  CreateApplicationDto,
  UpdateApplicationDto,
  UploadDocumentDto,
} from "./loan-applications.dto";
import type { UploadedDocument } from "./uploaded-document";

@Injectable()
export class LoanApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loanProductClient: LoanProductClient,
    private readonly storage: DocumentStorage,
    private readonly eligibility: ApplicationEligibilityPolicy,
  ) {}

  async create(customerId: string, dto: CreateApplicationDto) {
    const product = await this.loanProductClient.getById(dto.productId);

    if (product.status !== "ACTIVE") {
      throw new AppException(409, "PRODUCT_INACTIVE", "The selected loan product is inactive.");
    }

    this.validateRequestedTerms(product, dto.requestedAmount, dto.termMonths);

    const application = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${customerId}, 0))::text`;
      await this.eligibility.assertNoActiveApplication(tx, customerId);

      return tx.loanApplication.create({
        data: {
          customerId,
          productId: dto.productId,
          requestedAmount: BigInt(dto.requestedAmount),
          termMonths: dto.termMonths,
          purpose: dto.purpose,
          applicationNumber: `LA-${randomUUID()}`,
        },
        include: applicationInclude,
      });
    });

    return applicationResponse(application);
  }

  async update(customerId: string, id: string, dto: UpdateApplicationDto) {
    if (!Object.values(dto).some((value: unknown) => value !== undefined)) {
      throw new ValidationException([
        { field: "body", message: "At least one field is required." },
      ]);
    }

    if (
      dto.contacts &&
      new Set(dto.contacts.map((contact) => contact.phone.replace(/^\+/, ""))).size !==
        REQUIRED_CONTACT_COUNT
    ) {
      throw new ValidationException([
        { field: "contacts", message: "Exactly two distinct contact phone numbers are required." },
      ]);
    }

    return this.prisma.$transaction(
      async (tx) => {
        const application = await this.lockEditableApplication(tx, id, customerId);

        if (dto.requestedAmount !== undefined || dto.termMonths !== undefined) {
          const product = await this.loanProductClient.getById(application.productId);

          this.validateRequestedTerms(
            product,
            dto.requestedAmount ?? Number(application.requestedAmount),
            dto.termMonths ?? application.termMonths,
          );
        }

        const data = this.buildUpdateData(dto);
        const nameChanged =
          dto.applicantInfo?.fullName !== undefined &&
          dto.applicantInfo.fullName !== application.fullName;
        const identityChanged =
          nameChanged ||
          (dto.applicantInfo?.identityNumber !== undefined &&
            dto.applicantInfo.identityNumber !== application.identityNumber) ||
          (dto.applicantInfo?.dateOfBirth !== undefined &&
            dto.applicantInfo.dateOfBirth !==
              (application.dateOfBirth?.toISOString().slice(0, 10) ?? null));

        if (identityChanged) {
          await tx.identityVerification.updateMany({
            where: { applicationId: id, invalidatedAt: null },
            data: { invalidatedAt: new Date() },
          });
        }

        const accountChanged =
          dto.disbursementAccount !== undefined &&
          Object.entries(dto.disbursementAccount).some(
            ([key, value]) =>
              value !== undefined &&
              application[key as "accountNumber" | "accountHolderName"] !== value,
          );
        if (nameChanged || accountChanged) {
          data.accountVerificationStatus = VerificationStatus.UNVERIFIED;
        }

        if (dto.contacts) {
          await tx.applicationContact.deleteMany({ where: { applicationId: id } });
          data.contacts = {
            create: dto.contacts.map((contact, position) => ({ ...contact, position })),
          };
        }

        const updated = await tx.loanApplication.update({
          where: { id },
          data,
          include: applicationInclude,
        });

        return applicationResponse(updated);
      },
      { timeout: 15000 },
    );
  }

  async uploadDocument(
    customerId: string,
    id: string,
    dto: UploadDocumentDto,
    file?: UploadedDocument,
  ) {
    const application = await this.prisma.loanApplication.findUnique({ where: { id } });

    this.assertEditable(application, customerId);

    if (!file || file.size === 0) {
      throw new ValidationException([{ field: "file", message: "A non-empty file is required." }]);
    }

    if (file.size > MAX_DOCUMENT_SIZE) {
      throw new AppException(
        413,
        "FILE_TOO_LARGE",
        "The uploaded file exceeds the maximum allowed size.",
      );
    }

    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.mimetype)) {
      throw new AppException(
        415,
        "UNSUPPORTED_FILE_TYPE",
        "The uploaded file type is not supported.",
      );
    }

    const product = await this.loanProductClient.getById(application.productId);

    if (!product.requiredDocumentTypes.includes(dto.type)) {
      throw new AppException(
        422,
        "DOCUMENT_TYPE_NOT_REQUIRED",
        "The document type is not required by the selected loan product.",
      );
    }

    const documentId = randomUUID();
    const key = `${application.id}/${documentId}`;

    await this.storage.put(key, file.buffer);

    const fileName = this.sanitizeDocumentFileName(file.originalname);
    const document = await this.prisma.$transaction(async (tx) => {
      await this.lockEditableApplication(tx, id, customerId);
      await tx.applicationDocument.updateMany({
        where: { applicationId: id, type: dto.type, isCurrent: true },
        data: { isCurrent: false },
      });

      const created = await tx.applicationDocument.create({
        data: {
          id: documentId,
          applicationId: id,
          type: dto.type,
          fileName,
          contentType: file.mimetype,
          size: file.size,
          storageKey: key,
        },
      });

      await tx.loanApplication.update({ where: { id }, data: { updatedAt: new Date() } });

      return created;
    });

    return documentResponse(document);
  }

  private sanitizeDocumentFileName(originalName: string): string {
    const fileName = basename(originalName.replace(/\\/g, "/"));
    const characters = [...fileName].filter((character) => {
      const code = character.charCodeAt(0);

      return code >= 32 && code !== 127;
    });
    const sanitizedName = characters.join("").slice(0, 255);

    return sanitizedName || "document";
  }

  private async lockEditableApplication(
    tx: Prisma.TransactionClient,
    id: string,
    customerId: string,
  ) {
    await tx.$queryRaw`SELECT id FROM loan_applications WHERE id = ${id}::uuid FOR UPDATE`;

    const application = await tx.loanApplication.findUnique({ where: { id } });

    this.assertEditable(application, customerId);

    return application;
  }

  private assertEditable<T extends { customerId: string; status: string }>(
    application: T | null,
    customerId: string,
  ): asserts application is T {
    if (!application) {
      throw new AppException(
        404,
        "APPLICATION_NOT_FOUND",
        "The requested loan application was not found.",
      );
    }

    if (application.customerId !== customerId) {
      throw forbiddenException();
    }

    if (application.status !== "DRAFT") {
      throw applicationNotEditableException();
    }
  }

  private validateRequestedTerms(
    product: LoanProductTerms,
    requestedAmount: number,
    termMonths: number,
  ): void {
    if (requestedAmount < product.minAmount || requestedAmount > product.maxAmount) {
      throw new AppException(
        400,
        "AMOUNT_OUT_OF_RANGE",
        "The requested amount is outside the product's allowed range.",
      );
    }

    if (!product.allowedTerms.includes(termMonths)) {
      throw new AppException(
        400,
        "TERM_NOT_ALLOWED",
        "The selected term is not allowed for this loan product.",
      );
    }
  }

  private buildUpdateData(dto: UpdateApplicationDto): Prisma.LoanApplicationUpdateInput {
    const {
      contacts: _contacts,
      applicantInfo,
      currentAddress,
      employmentInfo,
      financialInfo,
      disbursementAccount,
      ...root
    } = dto;
    const { requestedAmount, ...scalar } = root;
    const data: Prisma.LoanApplicationUpdateInput = {
      ...scalar,
      ...applicantInfo,
      ...currentAddress,
      ...employmentInfo,
      ...disbursementAccount,
    };

    if (requestedAmount !== undefined) {
      data.requestedAmount = BigInt(requestedAmount);
    }

    for (const field of ["monthlyIncome", "otherMonthlyIncome"] as const) {
      const value = financialInfo?.[field];

      if (value !== undefined) {
        data[field] = value === null ? null : BigInt(value);
      }
    }

    for (const field of ["dateOfBirth", "identityIssuedDate", "employmentStartDate"] as const) {
      const value =
        field === "employmentStartDate" ? employmentInfo?.[field] : applicantInfo?.[field];

      if (value !== undefined) {
        data[field] = value === null ? null : new Date(`${value}T00:00:00.000Z`);
      }
    }

    return data;
  }
}
