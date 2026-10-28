import "reflect-metadata";

import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

import { Test } from "@nestjs/testing";

const require = createRequire(import.meta.url);
const { AppModule } = require("../dist/app.module.js");
const { PrismaService } = require("../dist/modules/prisma/prisma.service.js");
const loanId = randomUUID();
const ownerId = randomUUID();
const secret = "repayment-schedule-test-only-signing-secret-with-sufficient-length";
const previousSecret = process.env.JWT_SECRET;
let app;
let url;
let loan = { customerId: ownerId };
let reads = 0;

const items = [
  {
    id: randomUUID(),
    installmentNumber: 2,
    dueDate: new Date("2026-12-31T00:00:00.000Z"),
    openingPrincipal: 50n,
    principalAmount: 50n,
    interestAmount: 1n,
    totalAmount: 51n,
    paidPrincipal: 10n,
    paidInterest: 1n,
    status: "PARTIALLY_PAID",
  },
  {
    id: randomUUID(),
    installmentNumber: 1,
    dueDate: new Date("2026-11-30T00:00:00.000Z"),
    openingPrincipal: 100n,
    principalAmount: 50n,
    interestAmount: 2n,
    totalAmount: 52n,
    paidPrincipal: 50n,
    paidInterest: 2n,
    status: "PAID",
  },
];

function cookie(role = "CUSTOMER", sub = ownerId) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub, role, tokenType: "access", exp: Math.floor(Date.now() / 1000) + 900 }),
  ).toString("base64url");
  const input = `${header}.${payload}`;
  return `access_token=${input}.${createHmac("sha256", secret).update(input).digest("base64url")}`;
}

async function get(id = loanId, auth = cookie()) {
  const response = await fetch(`${url}/loans/${id}/repayment-schedule`, {
    headers: { cookie: auth },
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  process.env.JWT_SECRET = secret;
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({
      loan: {
        async findUnique() {
          return loan;
        },
      },
      repaymentInstallment: {
        async findMany({ where, orderBy }) {
          reads++;
          assert.deepEqual(where, { loanId });
          assert.deepEqual(orderBy, { installmentNumber: "asc" });
          return [...items].sort((a, b) => a.installmentNumber - b.installmentNumber);
        },
      },
    })
    .compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix("api/v1");
  await app.listen(0, "127.0.0.1");
  url = `${await app.getUrl()}/api/v1`;
});

after(async () => {
  await app?.close();
  if (previousSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = previousSecret;
  }
});

test("owner reads ordered schedule with paid and outstanding amounts", async () => {
  const result = await get();
  assert.equal(result.status, 200);
  assert.equal(result.body.loanId, loanId);
  assert.deepEqual(
    result.body.items.map((item) => item.installmentNumber),
    [1, 2],
  );
  assert.deepEqual(
    result.body.items.map((item) => item.dueDate),
    ["2026-11-30", "2026-12-31"],
  );
  assert.deepEqual(
    result.body.items.map((item) => item.outstandingAmount),
    [0, 40],
  );
  assert.deepEqual(
    [result.body.totalPrincipal, result.body.totalInterest, result.body.totalPayable],
    [100, 3, 103],
  );
});

test("staff may read and another customer may not", async () => {
  assert.equal((await get(loanId, cookie("STAFF", randomUUID()))).status, 200);
  reads = 0;
  const forbidden = await get(loanId, cookie("CUSTOMER", randomUUID()));
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.code, "FORBIDDEN");
  assert.equal(reads, 0);
});

test("authentication and path validation return spec errors", async () => {
  for (const auth of ["", "access_token=bad", cookie("ADMIN")]) {
    const response = await get(loanId, auth);
    assert.equal(response.status, auth === cookie("ADMIN") ? 403 : 401);
  }
  const invalid = await get("bad-id");
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, "VALIDATION_ERROR");
});

test("missing loan returns LOAN_NOT_FOUND", async () => {
  loan = null;
  const result = await get();
  assert.equal(result.status, 404);
  assert.equal(result.body.code, "LOAN_NOT_FOUND");
  loan = { customerId: ownerId };
});
