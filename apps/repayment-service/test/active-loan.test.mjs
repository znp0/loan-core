import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { after, before, beforeEach, test } from "node:test";

import { Test } from "@nestjs/testing";

const require = createRequire(import.meta.url);
const { AppModule } = require("../dist/app.module.js");
const { PrismaService } = require("../dist/modules/prisma/prisma.service.js");
const originalToken = process.env.REPAYMENT_INTERNAL_TOKEN;
const originalJwtSecret = process.env.JWT_SECRET;
const customerId = randomUUID();
const token = "test-internal-token";
const loans = [];
let app;
let url;
let queries = 0;

const repository = {
  loan: {
    async findFirst({ where }) {
      queries += 1;
      return (
        loans.find(
          (loan) => loan.customerId === where.customerId && where.status.in.includes(loan.status),
        ) ?? null
      );
    },
  },
};

async function get(id = customerId, suppliedToken = token) {
  const headers = suppliedToken === null ? {} : { "X-Internal-Service-Token": suppliedToken };
  return fetch(`${url}/internal/customers/${id}/active-loan`, { headers });
}

before(async () => {
  process.env.REPAYMENT_INTERNAL_TOKEN = token;
  process.env.JWT_SECRET = "repayment-test-only-signing-secret-with-sufficient-length";
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
  loans.length = 0;
  queries = 0;
  process.env.REPAYMENT_INTERNAL_TOKEN = token;
});

after(async () => {
  await app?.close();
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
  if (originalToken === undefined) {
    delete process.env.REPAYMENT_INTERNAL_TOKEN;
  } else {
    process.env.REPAYMENT_INTERNAL_TOKEN = originalToken;
  }
});

test("ACTIVE and OVERDUE loans block a customer", async () => {
  for (const status of ["ACTIVE", "OVERDUE"]) {
    loans.push({ id: randomUUID(), customerId, status });
    const response = await get();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { hasActiveLoan: true });
    loans.length = 0;
  }
});

test("CLOSED loans and absent loans do not block a customer", async () => {
  loans.push({ id: randomUUID(), customerId, status: "CLOSED" });
  assert.deepEqual(await (await get()).json(), { hasActiveLoan: false });
  loans.length = 0;
  assert.deepEqual(await (await get()).json(), { hasActiveLoan: false });
});

test("missing, wrong, and unconfigured internal tokens cannot query loans", async () => {
  for (const suppliedToken of [null, "wrong-token", token]) {
    if (suppliedToken === token) {
      delete process.env.REPAYMENT_INTERNAL_TOKEN;
    }
    const response = await get(customerId, suppliedToken);
    assert.equal(response.status, 401);
  }
  assert.equal(queries, 0);
});

test("invalid customer IDs are rejected before querying loans", async () => {
  const response = await get("not-a-uuid");
  assert.equal(response.status, 400);
  assert.equal(queries, 0);
});

test("missing internal token is rejected before customer ID validation", async () => {
  const response = await get("not-a-uuid", null);
  assert.equal(response.status, 401);
  assert.equal(queries, 0);
});
