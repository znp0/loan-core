import type { ValidationService } from "../validation/validation.service";

type Evaluation = Awaited<ReturnType<ValidationService["evaluate"]>>;

function date(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

export function buildContractSnapshots(evaluation: Evaluation) {
  const { application } = evaluation;
  const applicationSnapshot = {
    id: application.id,
    applicationNumber: application.applicationNumber,
    customerId: application.customerId,
    productId: application.productId,
    requestedAmount: Number(application.requestedAmount),
    termMonths: application.termMonths,
    purpose: application.purpose,
    applicantInfo: {
      fullName: application.fullName,
      dateOfBirth: date(application.dateOfBirth),
      identityNumber: application.identityNumber,
      identityIssuedDate: date(application.identityIssuedDate),
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
      monthlyIncome: application.monthlyIncome?.toString() ?? null,
      otherMonthlyIncome: application.otherMonthlyIncome?.toString() ?? null,
    },
    contacts: application.contacts.map((contact) => ({
      fullName: contact.fullName,
      relationship: contact.relationship,
      phone: contact.phone,
    })),
    documents: application.documents
      .filter((document) => document.isCurrent)
      .map((document) => ({
        id: document.id,
        type: document.type,
        fileName: document.fileName,
        contentType: document.contentType,
        size: document.size,
        uploadedAt: document.uploadedAt.toISOString(),
      })),
    identityVerification: application.identityVerifications[0]
      ? {
          id: application.identityVerifications[0].id,
          status: application.identityVerifications[0].status,
          verifiedAt: application.identityVerifications[0].verifiedAt.toISOString(),
        }
      : null,
    disbursementAccount: {
      accountNumber: application.accountNumber,
      accountHolderName: application.accountHolderName,
      verificationStatus: application.accountVerificationStatus,
    },
  };
  const productSnapshot = { ...evaluation.product };

  return { applicationSnapshot, productSnapshot };
}
