import assert from "node:assert/strict";
import test from "node:test";

import { BadRequestException } from "@nestjs/common";

import { HttpExceptionFilter } from "../dist/common/filters/http-exception.filter.js";
import { InternalLoanProductController } from "../dist/modules/loan-product/internal-loan-product.controller.js";
import { LoanProductService } from "../dist/modules/loan-product/loan-product.service.js";

const product = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Test product",
  description: "Terms",
  status: "ACTIVE",
  currency: "VND",
  minAmount: 1000000n,
  maxAmount: 5000000n,
  allowedTerms: [6, 12],
  annualInterestRate: { toNumber: () => 12.5, toFixed: () => "12.5000" },
  minAge: 20,
  maxAge: 60,
  requiredDocumentTypes: ["ID_FRONT", "ID_BACK"],
  createdAt: new Date("2026-10-24T00:00:00.000Z"),
  updatedAt: new Date("2026-10-24T00:00:00.000Z"),
};

test("internal product reads require the configured service credential and expose inactive terms", async () => {
  const originalToken = process.env.APPLICATION_SERVICE_TOKEN;

  process.env.APPLICATION_SERVICE_TOKEN = "test-internal-service-token";
  const inactive = { ...product, status: "INACTIVE" };
  const prisma = { loanProduct: { findUnique: async () => inactive } };
  const controller = new InternalLoanProductController(new LoanProductService(prisma));

  try {
    for (const token of [undefined, "wrong", "x".repeat(27)]) {
      assert.throws(
        () => controller.get(product.id, token),
        (error) => error.getStatus() === 403,
      );
    }
    assert.equal(
      (await controller.get(product.id, process.env.APPLICATION_SERVICE_TOKEN)).status,
      "INACTIVE",
    );
    delete process.env.APPLICATION_SERVICE_TOKEN;
    assert.throws(
      () => controller.get(product.id, "anything"),
      (error) => error.getStatus() === 403,
    );
  } finally {
    if (originalToken === undefined) {
      delete process.env.APPLICATION_SERVICE_TOKEN;
    } else {
      process.env.APPLICATION_SERVICE_TOKEN = originalToken;
    }
  }
});

test("list maps database values into the public JSON shape", async () => {
  const prisma = { loanProduct: { findMany: async () => [product], count: async () => 1 } };
  const response = await new LoanProductService(prisma).list({ page: 0, size: 20 });

  assert.deepEqual(response, {
    data: [
      {
        ...product,
        minAmount: 1000000,
        maxAmount: 5000000,
        annualInterestRate: 12.5,
        createdAt: "2026-10-24T00:00:00.000Z",
        updatedAt: "2026-10-24T00:00:00.000Z",
      },
    ],
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  });
});

test("an inactive or missing product is not returned", async () => {
  const prisma = { loanProduct: { findFirst: async () => null } };
  await assert.rejects(new LoanProductService(prisma).get(product.id), (error) => {
    assert.equal(error.getStatus(), 404);
    assert.deepEqual(error.getResponse(), {
      code: "PRODUCT_NOT_FOUND",
      message: "The requested loan product was not found.",
      details: [],
    });

    return true;
  });
});

test("internal validation terms include inactive products without exposing other fields", async () => {
  const prisma = { loanProduct: { findUnique: async () => ({ ...product, status: "INACTIVE" }) } };
  const response = await new LoanProductService(prisma).getValidationTerms(product.id);

  assert.deepEqual(response, {
    id: product.id,
    minAmount: 1000000,
    maxAmount: 5000000,
    allowedTerms: [6, 12],
    annualInterestRate: "12.5000",
    minAge: 20,
    maxAge: 60,
    requiredDocumentTypes: ["ID_FRONT", "ID_BACK"],
  });
});

test("internal validation terms return product not found for a missing product", async () => {
  const prisma = { loanProduct: { findUnique: async () => null } };

  await assert.rejects(new LoanProductService(prisma).getValidationTerms(product.id), (error) => {
    assert.equal(error.getStatus(), 404);
    assert.equal(error.getResponse().code, "PRODUCT_NOT_FOUND");
    return true;
  });
});

test("filter hides unexpected details and normalizes Nest errors", () => {
  let status;
  let body;
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({
        status(value) {
          status = value;

          return this;
        },
        json(value) {
          body = value;
        },
      }),
    }),
  };
  const filter = new HttpExceptionFilter();

  filter.catch(new BadRequestException("private input"), host);
  assert.equal(status, 400);
  assert.deepEqual(body, {
    code: "VALIDATION_ERROR",
    message: "The request contains invalid fields.",
    details: [],
  });

  filter.catch(Object.assign(new Error("private database URL"), { code: "P1017" }), host);
  assert.equal(status, 503);
  assert.deepEqual(body, {
    code: "DATABASE_ERROR",
    message: "Database temporarily unavailable.",
    details: [],
  });

  filter.catch(new Error("private database URL"), host);
  assert.equal(status, 500);
  assert.deepEqual(body, {
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred.",
    details: [],
  });
});
