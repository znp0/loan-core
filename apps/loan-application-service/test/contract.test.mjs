import "reflect-metadata";

import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { after, before, beforeEach, test } from "node:test";

import { Test } from "@nestjs/testing";

const require = createRequire(import.meta.url);
const { AppModule } = require("../dist/app.module.js");
const { PrismaService } = require("../dist/modules/prisma/prisma.service.js");
const { buildContractSchedule } = require("../dist/modules/contract/contract-schedule.js");
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
const secret = "contract-test-jwt-secret-with-at-least-32-bytes";
const customerId = randomUUID();
const productTerms = {
  id: randomUUID(),
  minAmount: 1,
  maxAmount: 1000,
  allowedTerms: [2],
  annualInterestRate: "6.0000",
  minAge: 18,
  maxAge: 65,
  requiredDocumentTypes: ["ID_FRONT", "ID_BACK"],
};
const applications = new Map();
const contracts = [];
let transactionTail = Promise.resolve();
let app;
let url;
let productUnavailable;
let hasActiveLoan;

const repository = {
  async $transaction(callback) {
    let release;
    const previous = transactionTail;
    transactionTail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await callback(repository);
    } finally {
      release();
    }
  },
  async $queryRaw(_query, applicationId) {
    const application = applications.get(applicationId);
    return application
      ? [
          {
            id: application.id,
            customerId: application.customerId,
            status: application.status,
          },
        ]
      : [];
  },
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
  loanContract: {
    async findFirst({ where }) {
      return (
        contracts
          .filter((contract) => contract.applicationId === where.applicationId)
          .sort((left, right) => right.version - left.version)[0] ?? null
      );
    },
    async create({ data }) {
      const now = new Date("2026-10-25T10:00:00.000Z");
      const record = { id: randomUUID(), ...data, createdAt: now, updatedAt: now };
      contracts.push(record);
      return record;
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
    applicationNumber: "APP-001",
    customerId,
    productId: productTerms.id,
    status: "DRAFT",
    purpose: "Home repair",
    requestedAmount: 101n,
    termMonths: 2,
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
    otherMonthlyIncome: 0n,
    accountNumber: "0123456789",
    accountHolderName: "NGUYEN VAN A",
    verificationStatus: "VERIFIED",
    createdAt: new Date("2026-10-24T00:00:00.000Z"),
    updatedAt: new Date("2026-10-25T00:00:00.000Z"),
    contacts: [
      { id: randomUUID(), fullName: "Contact One", relationship: "Friend", phone: "0900000001" },
      { id: randomUUID(), fullName: "Contact Two", relationship: "Sibling", phone: "0900000002" },
    ],
    documents: [
      {
        id: randomUUID(),
        type: "ID_FRONT",
        fileName: "front.png",
        contentType: "image/png",
        size: 100,
        storageKey: "private/front.png",
        isCurrent: true,
        uploadedAt: new Date("2026-10-24T01:00:00.000Z"),
      },
      {
        id: randomUUID(),
        type: "ID_BACK",
        fileName: "back.png",
        contentType: "image/png",
        size: 100,
        storageKey: "private/back.png",
        isCurrent: true,
        uploadedAt: new Date("2026-10-24T01:00:00.000Z"),
      },
      {
        id: randomUUID(),
        type: "ID_FRONT",
        fileName: "old-front.png",
        contentType: "image/png",
        size: 90,
        storageKey: "private/old-front.png",
        isCurrent: false,
        uploadedAt: new Date("2026-10-23T01:00:00.000Z"),
      },
    ],
    identityVerifications: [
      {
        id: randomUUID(),
        status: "PASSED",
        mismatchedFields: [],
        invalidatedAt: null,
        verifiedAt: new Date("2026-10-24T02:00:00.000Z"),
      },
    ],
    ...overrides,
  };
  applications.set(record.id, record);
  return record;
}

async function post(applicationId, options = {}) {
  const cookie = Object.hasOwn(options, "cookie") ? options.cookie : token();
  const headers = { ...(cookie ? { Cookie: `access_token=${cookie}` } : {}), ...options.headers };
  return originalFetch(
    `${url}/loan-applications/${applicationId}/contract${options.suffix ?? ""}`,
    {
      method: "POST",
      headers,
      body: options.body,
      signal: AbortSignal.timeout(10000),
    },
  );
}

before(async () => {
  process.env.JWT_SECRET = secret;
  process.env.LOAN_PRODUCT_SERVICE_URL = "http://product.internal";
  process.env.REPAYMENT_SERVICE_URL = "http://repayment.internal";
  process.env.PRODUCT_INTERNAL_TOKEN = "product-test-token";
  process.env.REPAYMENT_INTERNAL_TOKEN = "repayment-test-token";
  globalThis.fetch = async (input) => {
    const target = String(input);
    if (target.startsWith("http://product.internal")) {
      if (productUnavailable) {
        throw new TypeError("dependency unavailable");
      }
      return new Response(JSON.stringify(productTerms), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (target.startsWith("http://repayment.internal")) {
      return new Response(JSON.stringify({ hasActiveLoan }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input);
  };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(repository)
    .compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix("api/v1");
  await app.listen(0, "127.0.0.1");
  url = `${await app.getUrl()}/api/v1`;
});

beforeEach(() => {
  applications.clear();
  contracts.length = 0;
  transactionTail = Promise.resolve();
  productUnavailable = false;
  hasActiveLoan = false;
  productTerms.annualInterestRate = "6.0000";
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

test("creates exact declining-balance versions without exposing private snapshot fields", async () => {
  const record = application();

  const first = await post(record.id);
  assert.equal(first.status, 201);
  assert.deepEqual(await first.json(), {
    id: contracts[0].id,
    applicationId: record.id,
    contractNumber: "CONTRACT-APP-001",
    version: 1,
    status: "DRAFT",
    terms: {
      principalAmount: 101,
      currency: "VND",
      termMonths: 2,
      annualInterestRate: 6,
      interestCalculationMethod: "DECLINING_BALANCE_EQUAL_PRINCIPAL",
    },
    schedulePreview: [
      { installmentNumber: 1, principalAmount: 50, interestAmount: 1, totalAmount: 51 },
      { installmentNumber: 2, principalAmount: 51, interestAmount: 0, totalAmount: 51 },
    ],
    totalPrincipal: 101,
    totalInterest: 1,
    totalPayable: 102,
    signedAt: null,
    contentHash: null,
    createdAt: "2026-10-25T10:00:00.000Z",
    updatedAt: "2026-10-25T10:00:00.000Z",
  });
  assert.equal(JSON.stringify(contracts[0].applicationSnapshot).includes("storageKey"), false);
  assert.equal(contracts[0].applicationSnapshot.documents.length, 2);
  assert.equal(contracts[0].productSnapshot.annualInterestRate, "6.0000");

  const second = await post(record.id);
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.version, 2);
  assert.equal(secondBody.contractNumber, "CONTRACT-APP-001");
});

test("rejects unsafe monetary output and malformed exact-rate input", async () => {
  assert.throws(
    () => buildContractSchedule(BigInt(Number.MAX_SAFE_INTEGER) + 1n, 1, "0.0000"),
    /safe integer range/,
  );

  const record = application();
  productTerms.annualInterestRate = "not-a-rate";
  const response = await post(record.id);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "SERVICE_UNAVAILABLE");
});

test("enforces authentication, ownership and UUID syntax", async () => {
  const record = application();

  assert.equal((await post(record.id, { cookie: null })).status, 401);
  assert.equal((await post(record.id, { cookie: token({ role: "STAFF" }) })).status, 403);
  assert.equal((await post(record.id, { cookie: token({ sub: randomUUID() }) })).status, 403);
  assert.equal((await post(randomUUID())).status, 404);
  assert.equal((await post("not-a-uuid")).status, 400);
});

test("rejects query parameters, request bodies and malformed JSON", async () => {
  const record = application();

  assert.equal((await post(record.id, { suffix: "?refresh=true" })).status, 400);
  assert.equal(
    (
      await post(record.id, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: true }),
      })
    ).status,
    400,
  );
  const malformed = await post(record.id, {
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, "VALIDATION_ERROR");
});

test("rejects non-draft and incomplete applications and reports unavailable dependencies", async () => {
  const submitted = application({ status: "SUBMITTED" });
  let response = await post(submitted.id);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "APPLICATION_NOT_EDITABLE");

  const incomplete = application({ monthlyIncome: 0n });
  response = await post(incomplete.id);
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, "APPLICATION_NOT_READY");

  const complete = application();
  productUnavailable = true;
  response = await post(complete.id);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "SERVICE_UNAVAILABLE");
});

test("serializes concurrent creation into consecutive versions", async () => {
  const record = application();
  const responses = await Promise.all([post(record.id), post(record.id)]);
  const bodies = await Promise.all(responses.map((response) => response.json()));

  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
  assert.deepEqual(bodies.map((body) => body.version).sort(), [1, 2]);
});
