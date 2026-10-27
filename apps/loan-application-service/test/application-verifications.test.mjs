import "reflect-metadata";

import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { after, before, beforeEach, test } from "node:test";

import { Test } from "@nestjs/testing";

const require = createRequire(import.meta.url);
const { AppModule } = require("../dist/app.module.js");
const { PrismaService } = require("../dist/modules/prisma/prisma.service.js");
const secret = "test-only-secret-with-at-least-32-bytes";
const originalSecret = process.env.JWT_SECRET;
const applications = new Map();
const verifications = [];
const customerId = randomUUID();
let app;
let url;

const repository = {
  async $transaction(callback) {
    return callback(repository);
  },
  async $queryRaw(_query, applicationId) {
    const record = applications.get(applicationId);
    return record ? [{ id: record.id }] : [];
  },
  loanApplication: {
    async findUnique({ where }) {
      return applications.get(where.id) ?? null;
    },
    async update({ where, data }) {
      const record = applications.get(where.id);
      if (!record) {
        throw new Error("Application not found");
      }
      Object.assign(record, data);
      return record;
    },
  },
  identityVerification: {
    async create({ data }) {
      const record = { ...data, created_at: new Date() };
      verifications.push(record);
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
    customerId,
    status: "DRAFT",
    identityNumber: "012345678901",
    fullName: "Nguyễn Văn A",
    dateOfBirth: new Date("1990-01-31T00:00:00.000Z"),
    accountNumber: "0123456789",
    accountHolderName: "NGUYEN VAN A",
    accountVerificationStatus: "UNVERIFIED",
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
  applications.set(record.id, record);
  return record;
}

function body(overrides = {}) {
  return {
    identityNumber: "012345678901",
    fullName: "  nguyễn văn a  ",
    dateOfBirth: "1990-01-31",
    ...overrides,
  };
}

async function post(applicationId, input = body(), cookie = token()) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) {
    headers.Cookie = `access_token=${cookie}`;
  }
  return fetch(`${url}/loan-applications/${applicationId}/identity-verifications`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(10000),
  });
}

async function verifyAccount(applicationId, { cookie = token(), query = "", body } = {}) {
  const headers = {};
  if (cookie) {
    headers.Cookie = `access_token=${cookie}`;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${url}/loan-applications/${applicationId}/disbursement-account/verify${query}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
}

async function assertError(response, status, code) {
  assert.equal(response.status, status);
  const payload = await response.json();
  assert.equal(payload.code, code);
  assert.equal(typeof payload.message, "string");
  assert.ok(Array.isArray(payload.details));
}

before(async () => {
  process.env.JWT_SECRET = secret;
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
  verifications.length = 0;
});

after(async () => {
  await app?.close();
  if (originalSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalSecret;
  }
});

test("matching identity creates a PASSED verification without returning identity values", async () => {
  const record = application({ identityNumber: " 012345678901 " });
  const response = await post(record.id);
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.match(result.id, /^[0-9a-f-]{36}$/);
  assert.equal(result.applicationId, record.id);
  assert.equal(result.status, "PASSED");
  assert.deepEqual(result.mismatchedFields, []);
  assert.ok(!Number.isNaN(Date.parse(result.verifiedAt)));
  assert.deepEqual(Object.keys(result).sort(), [
    "applicationId",
    "id",
    "mismatchedFields",
    "status",
    "verifiedAt",
  ]);
  assert.equal(verifications.length, 1);
});

test("mismatches and missing stored values create FAILED with fields in request order", async () => {
  const record = application({ dateOfBirth: null });
  const response = await post(
    record.id,
    body({ identityNumber: "different", fullName: "Other Name" }),
  );
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.status, "FAILED");
  assert.deepEqual(result.mismatchedFields, ["identityNumber", "fullName", "dateOfBirth"]);
});

test("later verification keeps the earlier attempt and records a new result", async () => {
  const record = application();
  const first = await (await post(record.id)).json();
  const second = await (await post(record.id, body({ fullName: "Wrong" }))).json();
  assert.equal(first.status, "PASSED");
  assert.equal(second.status, "FAILED");
  assert.notEqual(first.id, second.id);
  assert.equal(verifications.length, 2);
  assert.equal(verifications[0].status, "PASSED");
  assert.equal(verifications[1].status, "FAILED");
});

test("invalid path and body values are rejected before persistence", async () => {
  const record = application();
  for (const input of [
    body({ identityNumber: undefined }),
    body({ identityNumber: " " }),
    body({ dateOfBirth: "2025-02-29" }),
    body({ status: "PASSED" }),
    body({ fullName: 42 }),
  ]) {
    await assertError(await post(record.id, input), 400, "VALIDATION_ERROR");
  }
  await assertError(await post("not-a-uuid"), 400, "VALIDATION_ERROR");
  assert.equal(verifications.length, 0);
});

test("malformed JSON uses the validation error envelope", async () => {
  const record = application();
  const response = await fetch(`${url}/loan-applications/${record.id}/identity-verifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `access_token=${token()}` },
    body: "{",
  });
  await assertError(response, 400, "VALIDATION_ERROR");
  assert.equal(verifications.length, 0);
});

test("only a valid customer access cookie can verify identity", async () => {
  const record = application();
  for (const cookie of [
    null,
    `${token()}corrupt`,
    token({ exp: Math.floor(Date.now() / 1000) - 1 }),
    token({ tokenType: "refresh" }),
  ]) {
    await assertError(await post(record.id, body(), cookie), 401, "UNAUTHORIZED");
  }
  await assertError(await post(record.id, body(), token({ role: "STAFF" })), 403, "FORBIDDEN");
  assert.equal(verifications.length, 0);
});

test("owner, existence and DRAFT status are enforced", async () => {
  const record = application();
  await assertError(await post(record.id, body(), token({ sub: randomUUID() })), 403, "FORBIDDEN");
  await assertError(await post(randomUUID()), 404, "APPLICATION_NOT_FOUND");
  record.status = "SUBMITTED";
  await assertError(await post(record.id), 409, "APPLICATION_NOT_EDITABLE");
  assert.equal(verifications.length, 0);
});

test("account verification accepts a normalized holder name and masks the number", async () => {
  const record = application({
    accountNumber: " 0123456789 ",
    accountHolderName: " NGUYEN VAN A ",
  });
  const response = await verifyAccount(record.id);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(Object.keys(result).sort(), [
    "accountHolderName",
    "maskedAccountNumber",
    "mismatchedFields",
    "status",
    "verifiedAt",
  ]);
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.accountHolderName, "NGUYEN VAN A");
  assert.equal(result.maskedAccountNumber, "******6789");
  assert.deepEqual(result.mismatchedFields, []);
  assert.ok(!Number.isNaN(Date.parse(result.verifiedAt)));
  assert.equal(record.accountVerificationStatus, "VERIFIED");
  assert.ok(record.updatedAt > new Date("2026-01-01T00:00:00.000Z"));
  assert.ok(!JSON.stringify(result).includes("0123456789"));
});

test("invalid bank, number and name return FAILED in field order", async () => {
  const record = application({
    accountNumber: "1234",
    accountHolderName: "OTHER PERSON",
  });
  const response = await verifyAccount(record.id);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, "FAILED");
  assert.deepEqual(result.mismatchedFields, ["accountNumber", "accountHolderName"]);
  assert.equal(result.maskedAccountNumber, "******");
  assert.equal(record.accountVerificationStatus, "FAILED");
  assert.ok(!JSON.stringify(result).includes('"1234"'));
});

test("missing borrower name is a failed name match, not an incomplete account", async () => {
  const record = application({ fullName: null });
  const response = await verifyAccount(record.id);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, "FAILED");
  assert.deepEqual(result.mismatchedFields, ["accountHolderName"]);
});

test("a later failed check replaces an earlier VERIFIED status", async () => {
  const record = application();
  assert.equal((await verifyAccount(record.id)).status, 200);
  assert.equal(record.accountVerificationStatus, "VERIFIED");
  record.accountHolderName = "OTHER PERSON";
  const response = await verifyAccount(record.id);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "FAILED");
  assert.equal(record.accountVerificationStatus, "FAILED");
});

test("missing account fields return 422 without changing prior status", async () => {
  for (const field of ["accountNumber", "accountHolderName"]) {
    for (const value of [null, "   "]) {
      const record = application({ [field]: value, accountVerificationStatus: "VERIFIED" });
      await assertError(await verifyAccount(record.id), 422, "ACCOUNT_INFORMATION_INCOMPLETE");
      assert.equal(record.accountVerificationStatus, "VERIFIED");
    }
  }
});

test("account verification ignores query parameters and bodies and verifies saved details", async () => {
  const record = application({ accountHolderName: "OTHER PERSON" });
  const options = [
    { query: "?status=VERIFIED" },
    { body: {} },
    {
      query: "?status=VERIFIED",
      body: { status: "VERIFIED", accountNumber: "9999999999", accountHolderName: "NGUYEN VAN A" },
    },
  ];

  for (const input of options) {
    const response = await verifyAccount(record.id, input);

    assert.equal(response.status, 200);

    const result = await response.json();

    assert.equal(result.status, "FAILED");
    assert.equal(result.accountHolderName, "OTHER PERSON");
    assert.equal(result.maskedAccountNumber, "******6789");
    assert.deepEqual(result.mismatchedFields, ["accountHolderName"]);
    assert.equal(record.accountVerificationStatus, "FAILED");
    assert.equal(record.accountNumber, "0123456789");
    assert.equal(record.accountHolderName, "OTHER PERSON");
  }
});

test("account verification ignores unused text bodies", async () => {
  const record = application();
  const textResponse = await fetch(
    `${url}/loan-applications/${record.id}/disbursement-account/verify`,
    {
      method: "POST",
      headers: { "Content-Type": "text/plain", Cookie: `access_token=${token()}` },
      body: "unexpected request body",
      signal: AbortSignal.timeout(10000),
    },
  );
  assert.equal(textResponse.status, 200);
  assert.equal((await textResponse.json()).status, "VERIFIED");
  assert.equal(record.accountVerificationStatus, "VERIFIED");
});

test("account verification rejects malformed JSON and invalid UUIDs before updating status", async () => {
  const record = application();
  const response = await fetch(
    `${url}/loan-applications/${record.id}/disbursement-account/verify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `access_token=${token()}` },
      body: "{",
      signal: AbortSignal.timeout(10000),
    },
  );

  await assertError(response, 400, "VALIDATION_ERROR");
  await assertError(await verifyAccount("not-a-uuid"), 400, "VALIDATION_ERROR");
  assert.equal(record.accountVerificationStatus, "UNVERIFIED");
});

test("account verification requires a CUSTOMER owner and DRAFT application", async () => {
  const record = application();
  await assertError(await verifyAccount(record.id, { cookie: null }), 401, "UNAUTHORIZED");
  await assertError(
    await verifyAccount(record.id, { cookie: token({ role: "STAFF" }) }),
    403,
    "FORBIDDEN",
  );
  await assertError(
    await verifyAccount(record.id, { cookie: token({ sub: randomUUID() }) }),
    403,
    "FORBIDDEN",
  );
  await assertError(await verifyAccount(randomUUID()), 404, "APPLICATION_NOT_FOUND");
  record.status = "SUBMITTED";
  await assertError(await verifyAccount(record.id), 409, "APPLICATION_NOT_EDITABLE");
  assert.equal(record.accountVerificationStatus, "UNVERIFIED");
});
