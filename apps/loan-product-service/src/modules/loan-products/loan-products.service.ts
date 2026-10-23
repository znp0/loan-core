import { Injectable } from "@nestjs/common";

import { type LoanProduct, LoanProductStatus } from "../../generated/prisma/client";
import {
  ProductNotFoundException,
  ValidationException,
} from "../../common/exceptions/app.exceptions";
import { PrismaService } from "../prisma/prisma.service";
import { ListLoanProductsQuery } from "./loan-products.dto";

function safeAmount(value: bigint): number {
  const amount = Number(value);

  if (!Number.isSafeInteger(amount)) {
    throw new Error("Loan product amount exceeds the JSON safe integer range");
  }

  return amount;
}

function productResponse(product: LoanProduct) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    status: product.status,
    currency: product.currency,
    minAmount: safeAmount(product.minAmount),
    maxAmount: safeAmount(product.maxAmount),
    allowedTerms: product.allowedTerms,
    annualInterestRate: product.annualInterestRate.toNumber(),
    minAge: product.minAge,
    maxAge: product.maxAge,
    requiredDocumentTypes: product.requiredDocumentTypes,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

@Injectable()
export class LoanProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListLoanProductsQuery) {
    const offset = query.page * query.size;

    if (!Number.isSafeInteger(offset)) {
      throw new ValidationException([
        { field: "page", message: "Page must be a non-negative integer." },
      ]);
    }

    const where = { status: LoanProductStatus.ACTIVE };
    const [products, totalElements] = await Promise.all([
      this.prisma.loanProduct.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: query.size,
      }),
      this.prisma.loanProduct.count({ where }),
    ]);

    return {
      data: products.map(productResponse),
      page: query.page,
      size: query.size,
      totalElements,
      totalPages: Math.ceil(totalElements / query.size),
    };
  }

  async get(productId: string) {
    const product = await this.prisma.loanProduct.findFirst({
      where: { id: productId, status: LoanProductStatus.ACTIVE },
    });

    if (!product) {
      throw new ProductNotFoundException();
    }

    return productResponse(product);
  }
}
