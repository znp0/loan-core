import type { Prisma, ApplicationDocument } from "../../generated/prisma/client";

export const applicationInclude = {
  contacts: { orderBy: { position: "asc" } },
  documents: { where: { isCurrent: true }, orderBy: [{ type: "asc" }, { id: "asc" }] },
} satisfies Prisma.LoanApplicationInclude;

export type ApplicationRecord = Prisma.LoanApplicationGetPayload<{
  include: typeof applicationInclude;
}>;

export function documentResponse(document: ApplicationDocument) {
  return {
    id: document.id,
    type: document.type,
    fileName: document.fileName,
    contentType: document.contentType,
    size: document.size,
    uploadedAt: document.uploadedAt.toISOString(),
  };
}

export function applicationResponse(application: ApplicationRecord) {
  const date = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
  const money = (value: bigint | null) => (value === null ? null : Number(value));
  return {
    id: application.id,
    applicationNumber: application.applicationNumber,
    customerId: application.customerId,
    productId: application.productId,
    status: application.status,
    requestedAmount: Number(application.requestedAmount),
    termMonths: application.termMonths,
    purpose: application.purpose,
    applicantInfo: {
      fullName: application.fullName,
      dateOfBirth: date(application.dateOfBirth),
      identityNumber: application.identityNumber,
      identityIssuedDate: date(application.identityIssuedDate),
      identityExpiryDate: date(application.identityExpiryDate),
      email: application.email,
      phone: application.phone,
    },
    currentAddress: {
      addressLine: application.addressLine,
      ward: application.ward,
      district: application.district,
      province: application.province,
    },
    employmentInfo: {
      employmentType: application.employmentType,
      employerName: application.employerName,
      jobTitle: application.jobTitle,
      employmentStartDate: date(application.employmentStartDate),
    },
    financialInfo: {
      monthlyIncome: money(application.monthlyIncome),
      otherMonthlyIncome: money(application.otherMonthlyIncome),
    },
    contacts: application.contacts.map(({ fullName, relationship, phone }) => ({
      fullName,
      relationship,
      phone,
    })),
    disbursementAccount: {
      bankCode: application.bankCode,
      accountNumber: application.accountNumber,
      accountHolderName: application.accountHolderName,
      verificationStatus: application.verificationStatus,
    },
    documents: application.documents.map(documentResponse),
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
  };
}
