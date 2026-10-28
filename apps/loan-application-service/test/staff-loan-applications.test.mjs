import "reflect-metadata";

import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { after, before, beforeEach, test } from "node:test";

import { Test } from "@nestjs/testing";

import { memoryPrisma } from "./memory-prisma.mjs";

const require = createRequire(import.meta.url);
const { AppModule } = require("../dist/app.module.js");
const { PrismaService } = require("../dist/modules/prisma/prisma.service.js");
const secret = randomBytes(32).toString("hex");
const applicationId = randomUUID();
const productId = randomUUID();
const staffId = randomUUID();
const previousEnvironment = Object.fromEntries(
  ["JWT_SECRET", "LOAN_PRODUCT_SERVICE_URL", "PRODUCT_INTERNAL_TOKEN"].map((key) => [
    key,
    process.env[key],
  ]),
);
const product = {
  id: productId,
  status: "ACTIVE",
  minAmount: 100,
  maxAmount: 10000,
  allowedTerms: [2, 6],
  requiredDocumentTypes: ["ID_FRONT", "ID_BACK"],
};
let app;
let url;
let productServer;
let application;
let contracts;
let reads;
let productReads;
let productStatus;
let updates;
let transactionTail = Promise.resolve();

function cookie(claims = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: staffId,
      role: "STAFF",
      tokenType: "access",
      exp: Math.floor(Date.now() / 1000) + 900,
      ...claims,
    }),
  ).toString("base64url");
  const input = `${header}.${payload}`;
  return `access_token=${input}.${createHmac("sha256", secret).update(input).digest("base64url")}`;
}

async function review(auth = cookie(), id = applicationId) {
  const response = await fetch(`${url}/staff/loan-applications/${id}/review`, {
    headers: { cookie: auth },
  });
  return { status: response.status, body: await response.json() };
}

async function decision(body, auth = cookie(), id = applicationId) {
  const response = await fetch(`${url}/staff/loan-applications/${id}/decision`, {
    method: "POST",
    headers: { cookie: auth, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  process.env.JWT_SECRET = secret;
  process.env.PRODUCT_INTERNAL_TOKEN = "staff-review-test-only-service-token";
  // Use the existing tests' local HTTP fixture pattern to exercise the real product client.
  productServer = createServer((request, response) => {
    productReads++;
    assert.equal(request.method, "GET");
    assert.equal(request.url, `/api/v1/internal/loan-products/${productId}`);
    assert.equal(request.headers["x-internal-service-token"], process.env.PRODUCT_INTERNAL_TOKEN);
    response.writeHead(productStatus, { "content-type": "application/json" });
    response.end(JSON.stringify(productStatus === 200 ? product : { code: "PRODUCT_NOT_FOUND" }));
  });
  await new Promise((resolve) => productServer.listen(0, "127.0.0.1", resolve));
  process.env.LOAN_PRODUCT_SERVICE_URL = `http://127.0.0.1:${productServer.address().port}`;

  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({
      // As in the existing HTTP tests, serialize the repository double's transactions.
      // This does not verify PostgreSQL locking; that needs a dedicated test database.
      async $transaction(callback) {
        const previous = transactionTail;
        let release;
        transactionTail = new Promise((resolve) => {
          release = resolve;
        });
        await previous;
        const snapshot = structuredClone(application);
        try {
          return await callback(this);
        } catch (error) {
          application = snapshot;
          throw error;
        } finally {
          release();
        }
      },
      async $queryRaw(strings, id) {
        reads++;
        assert.match(strings.join("?"), /FOR UPDATE/);
        return application && id === applicationId ? [{ status: application.status }] : [];
      },
      loanApplication: {
        async findUnique({ where, include }) {
          reads++;
          if (!application || where.id !== applicationId) {
            return null;
          }
          return {
            ...structuredClone(application),
            documents: application.documents.filter(
              (document) => document.isCurrent === include.documents.where.isCurrent,
            ),
            ...(include.contracts && {
              contracts: [...contracts]
                .sort((a, b) => b.version - a.version)
                .slice(0, include.contracts.take),
            }),
          };
        },
        async findUniqueOrThrow(query) {
          const result = await this.findUnique(query);
          assert.ok(result);
          return result;
        },
        async update({ where, data, include }) {
          assert.deepEqual(Object.keys(data), ["status"]);
          updates++;
          Object.assign(application, data, { updatedAt: new Date() });
          return this.findUnique({ where, include });
        },
      },
    })
    .compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix("api/v1");
  await app.listen(0, "127.0.0.1");
  url = `${await app.getUrl()}/api/v1`;
});

beforeEach(async () => {
  reads = 0;
  productReads = 0;
  productStatus = 200;
  updates = 0;
  application = await memoryPrisma().loanApplication.create({
    data: {
      id: applicationId,
      applicationNumber: "APP-REVIEW-001",
      customerId: randomUUID(),
      productId,
      requestedAmount: 1200n,
      termMonths: 2,
      purpose: "Home repairs",
      status: "SUBMITTED",
      fullName: "Test Borrower",
      dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
      monthlyIncome: 10000n,
      updatedAt: new Date("2026-10-28T00:00:00.000Z"),
    },
    include: true,
  });
  application.documents = [
    {
      id: randomUUID(),
      applicationId,
      type: "ID_FRONT",
      fileName: "id-front.png",
      contentType: "image/png",
      size: 100,
      storageKey: "private-storage-key",
      isCurrent: true,
      uploadedAt: new Date("2026-10-28T00:00:00.000Z"),
    },
  ];
  const latest = {
    id: randomUUID(),
    applicationId,
    contractNumber: "CONTRACT-REVIEW-001",
    version: 2,
    status: "CUSTOMER_SIGNED",
    principalAmount: 1200n,
    currency: "VND",
    termMonths: 2,
    annualInterestRate: "6.0000",
    interestCalculationMethod: "DECLINING_BALANCE_EQUAL_PRINCIPAL",
    totalInterest: 9n,
    totalPayable: 1209n,
    applicationSnapshot: { privateSnapshot: true },
    productSnapshot: { ...product, annualInterestRate: "6.0000", maxAmount: 2000 },
    schedulePreview: [],
    signedAt: new Date("2026-10-28T01:00:00.000Z"),
    contentHash: "saved-content-hash",
    createdAt: new Date("2026-10-28T00:00:00.000Z"),
    updatedAt: new Date("2026-10-28T01:00:00.000Z"),
  };
  contracts = [{ ...latest, id: randomUUID(), version: 1, status: "DRAFT" }, latest];
});

after(async () => {
  await app?.close();
  if (productServer) {
    await new Promise((resolve, reject) =>
      productServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test("staff reviews application, current documents and latest contract using saved product terms", async () => {
  application.documents.push({ ...application.documents[0], id: randomUUID(), isCurrent: false });
  const before = structuredClone({ application, contracts });
  const result = await review();
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body), ["application", "productTerms", "contract"]);
  assert.equal(result.body.application.id, applicationId);
  assert.equal(result.body.application.requestedAmount, 1200);
  assert.equal(result.body.application.applicantInfo.dateOfBirth, "1990-01-01");
  assert.equal(result.body.application.financialInfo.monthlyIncome, 10000);
  assert.deepEqual(result.body.application.documents, [
    {
      id: application.documents[0].id,
      type: "ID_FRONT",
      fileName: "id-front.png",
      contentType: "image/png",
      size: 100,
      uploadedAt: "2026-10-28T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(result.body.productTerms, contracts[1].productSnapshot);
  assert.equal(result.body.contract.id, contracts[1].id);
  assert.equal(result.body.contract.version, 2);
  assert.equal(result.body.contract.status, "CUSTOMER_SIGNED");
  assert.deepEqual(result.body.contract.terms, {
    principalAmount: 1200,
    currency: "VND",
    termMonths: 2,
    annualInterestRate: 6,
    interestCalculationMethod: "DECLINING_BALANCE_EQUAL_PRINCIPAL",
  });
  assert.equal(result.body.contract.totalPayable, 1209);
  assert.equal(result.body.contract.signedAt, "2026-10-28T01:00:00.000Z");
  assert.equal(result.body.contract.contentHash, "saved-content-hash");
  assert.equal("applicationSnapshot" in result.body.contract, false);
  assert.equal("productSnapshot" in result.body.contract, false);
  assert.deepEqual((await review()).body, result.body);
  assert.deepEqual({ application, contracts }, before);
  assert.equal(productReads, 0);
});

test("review without a contract uses the existing product client and leaves contract null", async () => {
  contracts = [];
  application.status = "DRAFT";
  const result = await review();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.productTerms, product);
  assert.equal(result.body.contract, null);
  assert.equal(productReads, 1);
});

test("review reuses product lookup errors when no contract is available", async () => {
  contracts = [];
  productStatus = 404;
  const result = await review();
  assert.equal(result.status, 404);
  assert.equal(result.body.code, "PRODUCT_NOT_FOUND");
});

test("review requires a valid STAFF access cookie before looking up application data", async () => {
  for (const auth of ["", "access_token=bad", cookie({ exp: 1 }), `${cookie()}; ${cookie()}`]) {
    const result = await review(auth);
    assert.equal(result.status, 401);
    assert.equal(result.body.code, "UNAUTHORIZED");
  }
  for (const role of ["CUSTOMER", "ADMIN"]) {
    const result = await review(cookie({ role }));
    assert.equal(result.status, 403);
    assert.equal(result.body.code, "FORBIDDEN");
  }
  assert.equal(reads, 0);
  assert.equal(productReads, 0);
});

test("review uses the existing UUID validation and missing application errors", async () => {
  const invalid = await review(cookie(), "bad-id");
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, "VALIDATION_ERROR");
  assert.deepEqual(invalid.body.details, [
    { field: "applicationId", message: "Application ID must be a UUID." },
  ]);
  assert.equal(reads, 0);
  const missing = await review(cookie(), randomUUID());
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, "APPLICATION_NOT_FOUND");
  assert.equal(productReads, 0);
});

test("decisions change only application status and return the existing application shape", async () => {
  for (const status of ["APPROVED", "REJECTED"]) {
    application.status = "SUBMITTED";
    const before = structuredClone(application);
    const savedContracts = structuredClone(contracts);
    const result = await decision({ status });
    assert.equal(result.status, 200);
    assert.equal(result.body.id, applicationId);
    assert.equal(result.body.status, status);
    assert.equal(result.body.requestedAmount, 1200);
    assert.equal(result.body.applicantInfo.fullName, "Test Borrower");
    assert.equal(result.body.documents[0].id, application.documents[0].id);
    assert.equal("application" in result.body, false);
    assert.equal("decision" in result.body, false);
    assert.equal("contract" in result.body, false);
    assert.deepEqual(application, { ...before, status, updatedAt: application.updatedAt });
    assert.deepEqual(contracts, savedContracts);

    const savedApplication = structuredClone(application);
    const writes = updates;
    const repeated = await decision({ status });
    assert.equal(repeated.status, 200);
    assert.deepEqual(repeated.body, result.body);
    assert.deepEqual(application, savedApplication);
    assert.equal(updates, writes);
  }
  assert.equal(updates, 2);
  assert.equal(productReads, 0);
});

test("all other decision transitions return 409 without changes", async () => {
  for (const [from, to] of [
    ["DRAFT", "APPROVED"],
    ["DRAFT", "REJECTED"],
    ["WITHDRAWN", "APPROVED"],
    ["WITHDRAWN", "REJECTED"],
    ["APPROVED", "REJECTED"],
    ["REJECTED", "APPROVED"],
  ]) {
    application.status = from;
    const before = structuredClone(application);
    const result = await decision({ status: to });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, "APPLICATION_NOT_EDITABLE");
    assert.deepEqual(result.body.details, []);
    assert.deepEqual(application, before);
  }
  assert.equal(updates, 0);
  assert.equal(productReads, 0);
});

test("decision validation rejects invalid bodies, UUIDs and unknown fields before persistence", async () => {
  for (const status of [
    undefined,
    null,
    "",
    1,
    true,
    [],
    {},
    "APPROVE",
    "SUBMITTED",
    "WITHDRAWN",
  ]) {
    const result = await decision({ status });
    assert.equal(result.status, 400);
    assert.equal(result.body.code, "VALIDATION_ERROR");
    assert.ok(result.body.details.some((detail) => detail.field === "status"));
  }
  for (const body of [
    { status: "APPROVED", reason: "Extra field" },
    { status: "REJECTED", customerId: randomUUID() },
    "{",
  ]) {
    const result = await decision(body);
    assert.equal(result.status, 400);
    assert.equal(result.body.code, "VALIDATION_ERROR");
  }
  const invalid = await decision({ status: "APPROVED" }, cookie(), "bad-id");
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, "VALIDATION_ERROR");
  assert.equal(reads, 0);
  assert.equal(updates, 0);
});

test("decision requires STAFF authentication and reports missing applications", async () => {
  for (const [auth, status] of [
    ["", 401],
    ["access_token=bad", 401],
    [cookie({ role: "CUSTOMER" }), 403],
    [cookie({ role: "ADMIN" }), 403],
  ]) {
    assert.equal((await decision({ status: "APPROVED" }, auth)).status, status);
  }
  assert.equal(reads, 0);
  const missing = await decision({ status: "APPROVED" }, cookie(), randomUUID());
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, "APPLICATION_NOT_FOUND");
  assert.equal(updates, 0);
});

test("competing decisions preserve the first outcome and repeated decisions do not write", async () => {
  const competing = await Promise.all([
    decision({ status: "APPROVED" }),
    decision({ status: "REJECTED" }),
  ]);
  assert.deepEqual(competing.map((result) => result.status).sort(), [200, 409]);
  assert.equal(updates, 1);
  const finalStatus = application.status;
  const before = structuredClone(application);
  const repeated = await Promise.all([
    decision({ status: finalStatus }),
    decision({ status: finalStatus }),
  ]);
  assert.ok(repeated.every((result) => result.status === 200));
  assert.equal(updates, 1);
  assert.deepEqual(application, before);
});
