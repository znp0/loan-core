import "reflect-metadata";

import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { after, before, beforeEach, test } from "node:test";

import { Test } from "@nestjs/testing";

const require = createRequire(import.meta.url);
const { AppModule } = require("../dist/app.module.js");
const { PrismaService } = require("../dist/modules/prisma/prisma.service.js");
const secret = randomBytes(32).toString("hex");
const customerId = randomUUID();
const applicationId = randomUUID();
const previousSecret = process.env.JWT_SECRET;
let app;
let url;
let application;
let record;
let reads;

function cookie(claims = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: customerId,
      role: "CUSTOMER",
      tokenType: "access",
      exp: Math.floor(Date.now() / 1000) + 900,
      ...claims,
    }),
  ).toString("base64url");
  const input = `${header}.${payload}`;
  return `access_token=${input}.${createHmac("sha256", secret).update(input).digest("base64url")}`;
}

async function get(auth = cookie(), id = applicationId) {
  const response = await fetch(`${url}/loan-applications/${id}/disbursement`, {
    headers: { cookie: auth },
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  process.env.JWT_SECRET = secret;
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({
      async $transaction(callback) {
        return callback(this);
      },
      loanApplication: {
        async findUnique({ where }) {
          return where.id === applicationId ? application : null;
        },
      },
      disbursement: {
        async findUnique({ where, include }) {
          reads++;
          assert.equal(where.applicationId, applicationId);
          assert.deepEqual(include.attempts.orderBy, { attemptNumber: "asc" });
          if (!record) {
            return null;
          }
          return {
            ...record,
            attempts: [...record.attempts].sort((a, b) => a.attemptNumber - b.attemptNumber),
          };
        },
      },
    })
    .compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix("api/v1");
  await app.listen(0, "127.0.0.1");
  url = `${await app.getUrl()}/api/v1`;
});

beforeEach(() => {
  reads = 0;
  application = { customerId, accountNumber: "9999999999", accountHolderName: "Changed name" };
  record = {
    id: randomUUID(),
    applicationId,
    amount: 10000000n,
    currency: "VND",
    accountNumber: "1234567890",
    accountHolderName: "Original name",
    status: "SUCCEEDED",
    loanId: randomUUID(),
    createdAt: new Date("2026-10-28T00:00:00.000Z"),
    completedAt: new Date("2026-10-28T01:00:00.000Z"),
    attempts: [
      {
        id: randomUUID(),
        attemptNumber: 2,
        status: "SUCCEEDED",
        transactionReference: "txn-2",
        failureCode: null,
        failureMessage: null,
        processedAt: new Date("2026-10-28T01:00:00.000Z"),
      },
      {
        id: randomUUID(),
        attemptNumber: 1,
        status: "FAILED",
        transactionReference: null,
        failureCode: "BANK_UNAVAILABLE",
        failureMessage: "Try again later.",
        processedAt: new Date("2026-10-28T00:00:00.000Z"),
      },
    ],
  };
});

after(async () => {
  await app?.close();
  if (previousSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = previousSecret;
  }
});

test("owner reads a masked snapshot and ordered attempts without mutating persisted data", async () => {
  const original = structuredClone(record);
  const result = await get();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    id: record.id,
    applicationId,
    amount: 10000000,
    currency: "VND",
    destinationAccount: { maskedAccountNumber: "******7890", accountHolderName: "Original name" },
    status: "SUCCEEDED",
    attempts: [
      { ...record.attempts[1], processedAt: "2026-10-28T00:00:00.000Z" },
      { ...record.attempts[0], processedAt: "2026-10-28T01:00:00.000Z" },
    ],
    loanId: record.loanId,
    createdAt: "2026-10-28T00:00:00.000Z",
    completedAt: "2026-10-28T01:00:00.000Z",
  });
  assert.deepEqual((await get()).body, result.body);
  assert.deepEqual(record, original);
});

test("staff may read another customer's disbursement", async () => {
  assert.equal((await get(cookie({ role: "STAFF", sub: randomUUID() }))).status, 200);
});

test("authentication and authorization precede disbursement lookup", async () => {
  for (const auth of ["", "access_token=bad", cookie({ exp: 1 }), `${cookie()}; ${cookie()}`]) {
    const result = await get(auth);
    assert.equal(result.status, 401);
    assert.equal(result.body.code, "UNAUTHORIZED");
  }
  for (const claims of [{ role: "ADMIN" }, { sub: randomUUID() }]) {
    const result = await get(cookie(claims));
    assert.equal(result.status, 403);
    assert.equal(result.body.code, "FORBIDDEN");
  }
  assert.equal(reads, 0);
});

test("invalid UUID and missing application or disbursement have distinct errors", async () => {
  const invalid = await get(cookie(), "bad-id");
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, "VALIDATION_ERROR");
  const missing = await get(cookie(), randomUUID());
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, "APPLICATION_NOT_FOUND");
  record = null;
  const absent = await get();
  assert.equal(absent.status, 404);
  assert.deepEqual(absent.body, {
    code: "DISBURSEMENT_NOT_FOUND",
    message: "The disbursement record was not found.",
    details: [],
  });
});

test("pending, processing and failed results never expose a loan reference", async () => {
  for (const status of ["PENDING", "PROCESSING", "FAILED"]) {
    record.status = status;
    record.completedAt = null;
    record.attempts = [];
    const result = await get();
    assert.equal(result.status, 200);
    assert.equal(result.body.status, status);
    assert.equal(result.body.loanId, null);
    assert.equal(result.body.completedAt, null);
    assert.deepEqual(result.body.attempts, []);
  }
});

test("short accounts remain fully masked and maximum safe amounts remain exact", async () => {
  record.amount = 9007199254740991n;
  for (const [account, masked] of [
    ["1", "*"],
    ["12", "**"],
    ["123", "***"],
    ["1234", "****"],
    ["12345", "*2345"],
  ]) {
    record.accountNumber = account;
    const result = await get();
    assert.equal(result.status, 200);
    assert.equal(result.body.destinationAccount.maskedAccountNumber, masked);
    assert.equal(result.body.amount, Number.MAX_SAFE_INTEGER);
  }
});
