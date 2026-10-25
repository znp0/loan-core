import assert from "node:assert/strict";
import test from "node:test";

import "reflect-metadata";

import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { HttpExceptionFilter } from "../dist/common/filters/http-exception.filter.js";
import { InternalLoanProductsController } from "../dist/modules/loan-products/internal-loan-products.controller.js";
import { LoanProductsService } from "../dist/modules/loan-products/loan-products.service.js";
import { ProductInternalTokenGuard } from "../dist/common/guards/product-internal-token.guard.js";
import { PrismaService } from "../dist/modules/prisma/prisma.service.js";

const activeId = "00000000-0000-4000-8000-000000000001";
const inactiveId = "00000000-0000-4000-8000-000000000002";
const missingId = "00000000-0000-4000-8000-000000000003";
const terms = {
  minAmount: 1000000n,
  maxAmount: 5000000n,
  allowedTerms: [6, 12],
  minAge: 20,
  maxAge: 60,
  requiredDocumentTypes: ["ID_FRONT", "ID_BACK"],
};
const productFields = {
  name: "Test product",
  description: "Terms",
  currency: "VND",
  annualInterestRate: { toNumber: () => 12.5, toFixed: () => "12.5000" },
  createdAt: new Date("2026-10-24T00:00:00.000Z"),
  updatedAt: new Date("2026-10-24T00:00:00.000Z"),
  ...terms,
};
const products = new Map([
  [activeId, { id: activeId, status: "ACTIVE", ...productFields }],
  [inactiveId, { id: inactiveId, status: "INACTIVE", ...productFields }],
]);
let reads = 0;

class TestModule {}

Module({
  controllers: [InternalLoanProductsController],
  providers: [
    LoanProductsService,
    ProductInternalTokenGuard,
    {
      provide: PrismaService,
      useValue: {
        loanProduct: {
          findUnique: async ({ where }) => {
            reads++;
            return products.get(where.id) ?? null;
          },
        },
      },
    },
  ],
})(TestModule);

test("internal validation terms require a configured token and include active and inactive products", async () => {
  const previousToken = process.env.PRODUCT_INTERNAL_TOKEN;
  process.env.PRODUCT_INTERNAL_TOKEN = "test-shared-secret";
  const app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(0, "127.0.0.1");

  const base = `${await app.getUrl()}/api/v1/internal/loan-products`;
  const auth = { "X-Internal-Service-Token": "test-shared-secret" };

  try {
    for (const id of [activeId, inactiveId]) {
      const response = await fetch(`${base}/${id}/validation-terms`, { headers: auth });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        id,
        minAmount: 1000000,
        maxAmount: 5000000,
        allowedTerms: [6, 12],
        annualInterestRate: "12.5000",
        minAge: 20,
        maxAge: 60,
        requiredDocumentTypes: ["ID_FRONT", "ID_BACK"],
      });
    }

    const missing = await fetch(`${base}/${missingId}/validation-terms`, { headers: auth });
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), {
      code: "PRODUCT_NOT_FOUND",
      message: "The requested loan product was not found.",
      details: [],
    });

    const invalidId = await fetch(`${base}/not-a-uuid/validation-terms`, { headers: auth });
    assert.equal(invalidId.status, 400);
    assert.deepEqual(await invalidId.json(), {
      code: "VALIDATION_ERROR",
      message: "The request contains invalid fields.",
      details: [{ field: "productId", message: "Product ID must be a UUID." }],
    });

    const readsBeforeUnauthorized = reads;
    for (const headers of [{}, { "X-Internal-Service-Token": "wrong" }]) {
      const response = await fetch(`${base}/${activeId}/validation-terms`, { headers });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), {
        code: "UNAUTHORIZED",
        message: "Authentication is required to access this resource.",
        details: [],
      });
    }
    delete process.env.PRODUCT_INTERNAL_TOKEN;
    const unconfigured = await fetch(`${base}/${activeId}/validation-terms`, { headers: auth });
    assert.equal(unconfigured.status, 401);
    assert.equal((await unconfigured.json()).code, "UNAUTHORIZED");
    assert.equal(reads, readsBeforeUnauthorized);
  } finally {
    await app.close();
    if (previousToken === undefined) {
      delete process.env.PRODUCT_INTERNAL_TOKEN;
    } else {
      process.env.PRODUCT_INTERNAL_TOKEN = previousToken;
    }
  }
});
