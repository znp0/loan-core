import "reflect-metadata";

import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { after, before, beforeEach, test } from "node:test";

import { Test } from "@nestjs/testing";

const require = createRequire(import.meta.url);
const { AppModule } = require("../dist/app.module.js");
const { PrismaService } = require("../dist/modules/prisma/prisma.service.js");
const { ValidationService } = require("../dist/modules/validation/validation.service.js");
const originalFetch = globalThis.fetch;
const originalEnvironment = Object.fromEntries(
  [
    "JWT_SECRET",
    "LOAN_PRODUCT_SERVICE_URL",
    "REPAYMENT_SERVICE_URL",
    "PRODUCT_INTERNAL_TOKEN",
    "REPAYMENT_INTERNAL_TOKEN",
  ].map((key) => [key, process.env[key]]),
);
const secret = "validation-test-jwt-secret-with-at-least-32-bytes";
const customerId = randomUUID();
const applications = new Map();
const productTerms = {
  id: randomUUID(),
  status: "INACTIVE",
  minAmount: 10000000,
  maxAmount: 50000000,
  allowedTerms: [6, 12],
  annualInterestRate: "12.5000",
  minAge: 18,
  maxAge: 65,
  requiredDocumentTypes: ["ID_FRONT", "ID_BACK"],
};
let app;
let url;
let validationService;
let productStatus;
let productErrorCode;
let productMalformed404;
let productUnavailable;
let repaymentStatus;
let hasActiveLoan;

const repository = {
  loanApplication: {
    async findUnique({ where }) {
      return applications.get(where.id) ?? null;
    },
    async count({ where }) {
      return [...applications.values()].filter(
        (item) =>
          item.customerId === where.customerId &&
          item.id !== where.id.not &&
          where.status.in.includes(item.status),
      ).length;
    },
  },
};

function token(payload = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({
      sub: customerId,
      role: "CUSTOMER",
      tokenType: "access",
      exp: Math.floor(Date.now() / 1000) + 900,
      ...payload,
    }),
  ).toString("base64url");
  const unsigned = `${header}.${claims}`;
  const signature = createHmac("sha256", secret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

function application(overrides = {}) {
  const record = {
    id: randomUUID(),
    customerId,
    productId: productTerms.id,
    status: "DRAFT",
    purpose: "Home repair",
    requestedAmount: 20000000n,
    termMonths: 12,
    fullName: "Nguyễn Văn A",
    dateOfBirth: new Date("1990-01-31T00:00:00.000Z"),
    identityNumber: "012345678901",
    identityIssuedDate: new Date("2020-01-01T00:00:00.000Z"),
    email: "borrower@example.com",
    phone: "0912345678",
    addressLine: "1 Main Street",
    ward: "Ward 1",
    district: "District 1",
    province: "Ho Chi Minh City",
    employmentType: "SALARIED",
    employerName: "Example Co",
    jobTitle: "Engineer",
    employmentStartDate: new Date("2020-01-01T00:00:00.000Z"),
    monthlyIncome: 10000000n,
    accountNumber: "0123456789",
    accountHolderName: "NGUYEN VAN A",
    accountVerificationStatus: "VERIFIED",
    contacts: [
      { fullName: "Contact One", relationship: "Friend", phone: "0900000001" },
      { fullName: "Contact Two", relationship: "Sibling", phone: "0900000002" },
    ],
    documents: [
      { type: "ID_FRONT", isCurrent: true },
      { type: "ID_BACK", isCurrent: true },
    ],
    identityVerifications: [
      { id: randomUUID(), status: "PASSED", invalidatedAt: null, verifiedAt: new Date() },
    ],
    ...overrides,
  };
  applications.set(record.id, record);
  return record;
}

async function get(applicationId, { cookie = token(), suffix = "" } = {}) {
  const headers = cookie ? { Cookie: `access_token=${cookie}` } : {};
  return originalFetch(`${url}/loan-applications/${applicationId}/validation${suffix}`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
}

before(async () => {
  process.env.JWT_SECRET = secret;
  process.env.LOAN_PRODUCT_SERVICE_URL = "http://product.internal";
  process.env.REPAYMENT_SERVICE_URL = "http://repayment.internal";
  process.env.PRODUCT_INTERNAL_TOKEN = "product-test-token";
  process.env.REPAYMENT_INTERNAL_TOKEN = "repayment-test-token";
  globalThis.fetch = async (input, options) => {
    const target = String(input);
    if (target.startsWith("http://product.internal")) {
      assert.equal(
        new Headers(options.headers).get("X-Internal-Service-Token"),
        "product-test-token",
      );
      if (productUnavailable) {
        throw new TypeError("dependency unavailable");
      }
      let responseBody = JSON.stringify(productTerms);
      if (productStatus === 404) {
        if (productMalformed404) {
          responseBody = "not-json";
        } else {
          responseBody = JSON.stringify({
            code: productErrorCode,
            message: "Product unavailable",
            details: [],
          });
        }
      }
      return new Response(responseBody, {
        status: productStatus,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (target.startsWith("http://repayment.internal")) {
      assert.equal(
        new Headers(options.headers).get("X-Internal-Service-Token"),
        "repayment-test-token",
      );
      return new Response(JSON.stringify({ hasActiveLoan }), {
        status: repaymentStatus,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input, options);
  };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(repository)
    .compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix("api/v1");
  await app.listen(0, "127.0.0.1");
  url = `${await app.getUrl()}/api/v1`;
  validationService = app.get(ValidationService);
});

beforeEach(() => {
  applications.clear();
  productStatus = 200;
  productErrorCode = "PRODUCT_NOT_FOUND";
  productMalformed404 = false;
  productUnavailable = false;
  repaymentStatus = 200;
  hasActiveLoan = false;
});

after(async () => {
  await app?.close();
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test("complete application passes every check using inactive product terms", async () => {
  const record = application();
  const response = await get(record.id);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.valid, true);
  assert.equal(result.checks.length, 13);
  assert.ok(result.checks.every((item) => item.status === "PASSED"));
  assert.ok(!Number.isNaN(Date.parse(result.checkedAt)));
});

test("evaluation exposes the validated application and exact product terms for contract creation", async () => {
  const record = application();
  const evaluation = await validationService.evaluate(record.id, customerId);

  assert.equal(evaluation.result.valid, true);
  assert.equal(evaluation.application.id, record.id);
  assert.deepEqual(evaluation.product, productTerms);
});

test("business failures return every check with valid false and no writes", async () => {
  const record = application({
    fullName: null,
    addressLine: null,
    employerName: null,
    contacts: [],
    monthlyIncome: 0n,
    requestedAmount: 60000000n,
    termMonths: 9,
    identityVerifications: [
      { id: randomUUID(), status: "FAILED", invalidatedAt: null, verifiedAt: new Date() },
    ],
    documents: [{ type: "ID_FRONT", isCurrent: true }],
    accountVerificationStatus: "FAILED",
  });
  application({ id: randomUUID(), customerId, status: "SUBMITTED" });
  hasActiveLoan = true;
  const response = await get(record.id);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.valid, false);
  assert.equal(result.checks.length, 13);
  const failed = result.checks.filter((item) => item.status === "FAILED").map((item) => item.code);
  for (const code of [
    "REQUIRED_APPLICATION",
    "CURRENT_ADDRESS",
    "EMPLOYMENT",
    "CONTACTS",
    "MONTHLY_INCOME",
    "AMOUNT",
    "TERM",
    "IDENTITY_VERIFICATION",
    "REQUIRED_DOCUMENTS",
    "DISBURSEMENT_ACCOUNT",
    "ACTIVE_APPLICATION",
    "ACTIVE_LOAN",
  ]) {
    assert.ok(failed.includes(code), code);
  }
});

test("missing product fails product dependent checks but keeps the full response", async () => {
  const record = application();
  productStatus = 404;
  const response = await get(record.id);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.valid, false);
  assert.equal(result.checks.length, 13);
  for (const code of ["AGE", "AMOUNT", "TERM", "REQUIRED_DOCUMENTS"]) {
    assert.equal(result.checks.find((item) => item.code === code).status, "FAILED");
  }
});

test("an unknown internal route returns 503 rather than a business failure", async () => {
  const record = application();
  productStatus = 404;
  productErrorCode = "NOT_FOUND";
  const response = await get(record.id);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "SERVICE_UNAVAILABLE");
  productMalformed404 = true;
  const malformedResponse = await get(record.id);
  assert.equal(malformedResponse.status, 503);
  assert.equal((await malformedResponse.json()).code, "SERVICE_UNAVAILABLE");
});

test("an unavailable dependency returns 503 instead of marking the application invalid", async () => {
  const record = application();
  productUnavailable = true;
  const response = await get(record.id);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "SERVICE_UNAVAILABLE");
  productUnavailable = false;
  repaymentStatus = 503;
  const repaymentResponse = await get(record.id);
  assert.equal(repaymentResponse.status, 503);
  assert.equal((await repaymentResponse.json()).code, "SERVICE_UNAVAILABLE");
});

test("invalidated latest identity and superseded documents fail without using older records", async () => {
  const record = application({
    identityVerifications: [
      { id: randomUUID(), status: "PASSED", invalidatedAt: new Date(), verifiedAt: new Date() },
      {
        id: randomUUID(),
        status: "PASSED",
        invalidatedAt: null,
        verifiedAt: new Date("2020-01-01"),
      },
    ],
    documents: [
      { type: "ID_FRONT", isCurrent: false },
      { type: "ID_BACK", isCurrent: true },
    ],
  });
  const result = await (await get(record.id)).json();
  assert.equal(
    result.checks.find((item) => item.code === "IDENTITY_VERIFICATION").status,
    "FAILED",
  );
  assert.equal(result.checks.find((item) => item.code === "REQUIRED_DOCUMENTS").status, "FAILED");
});

test("non-salaried applicants do not need employer details", async () => {
  const record = application({
    employmentType: "SELF_EMPLOYED",
    employerName: null,
    jobTitle: null,
    employmentStartDate: null,
  });
  const result = await (await get(record.id)).json();
  assert.equal(result.checks.find((item) => item.code === "EMPLOYMENT").status, "PASSED");
});

test("validation enforces authentication, ownership and UUID syntax", async () => {
  const record = application();
  assert.equal((await get(record.id, { cookie: null })).status, 401);
  assert.equal((await get(record.id, { cookie: token({ role: "STAFF" }) })).status, 403);
  assert.equal((await get(record.id, { cookie: token({ sub: randomUUID() }) })).status, 403);
  assert.equal((await get(randomUUID())).status, 404);
  assert.equal((await get("not-a-uuid")).status, 400);
  assert.equal((await get(record.id, { suffix: "?status=PASSED" })).status, 400);
});
