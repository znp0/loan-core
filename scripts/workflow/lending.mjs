import assert from "node:assert/strict";
import { createHmac, randomInt, randomUUID } from "node:crypto";

import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";

export async function verifyLending({ bases, credentials, databases }) {
  const [identity, products, applications, repayment] = bases.map((base) => `${base}/api/v1`);
  const documents = new Map();
  const validator = new Ajv({ strict: false, validateFormats: false });

  for (const base of [identity, products, applications, repayment]) {
    const response = await fetch(`${base.replace("/api/v1", "")}/api/openapi.json`);

    assert.equal(response.status, 200);
    const document = await SwaggerParser.dereference(await response.json());

    documents.set(base, document);
  }
  const { serviceRequire } = await import("./environment.mjs");
  const require = serviceRequire("loan-product-service");
  const { PrismaClient } = require("./dist/generated/prisma/client.js");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const productDatabase = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databases[1].url }),
  });
  let product;

  try {
    product = await productDatabase.loanProduct.create({
      data: {
        name: "Workflow loan",
        status: "ACTIVE",
        minAmount: 1000000n,
        maxAmount: 5000000n,
        allowedTerms: [2],
        annualInterestRate: "12",
        minAge: 18,
        maxAge: 65,
        requiredDocumentTypes: ["ID_FRONT", "ID_BACK"],
      },
    });
  } finally {
    await productDatabase.$disconnect();
  }

  async function request(base, path, { method = "GET", body, cookie, key, status = 200 } = {}) {
    const headers = {};

    if (cookie) {
      headers.Cookie = cookie;
    }
    if (key) {
      headers["Idempotency-Key"] = key;
    }
    if (body && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body instanceof FormData ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();

    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(result)}`);
    const document = documents.get(base);
    const route = Object.keys(document.paths).find((candidate) => {
      const pattern = new RegExp(`^${candidate.replace(/\{[^}]+\}/g, "[^/]+")}$`);

      return pattern.test(`/api/v1${path.split("?")[0]}`);
    });
    const schema =
      document.paths[route]?.[method.toLowerCase()]?.responses[status]?.content?.[
        "application/json"
      ]?.schema;

    assert.ok(schema, `${method} ${path} response must be documented`);
    const validate = validator.compile(schema);

    assert.ok(
      validate(result),
      `${method} ${path} disagrees with OpenAPI: ${JSON.stringify(validate.errors)}`,
    );

    return { body: result, response };
  }

  const account = {
    fullName: "Nguyen Van A",
    phone: `09${String(randomInt(100000000)).padStart(8, "0")}`,
    email: `${randomUUID()}@example.com`,
    password: "test-only-workflow-password",
  };

  await request(identity, "/auth/register", { method: "POST", body: account, status: 201 });
  const login = await request(identity, "/auth/login", {
    method: "POST",
    body: { phone: account.phone, password: account.password },
  });
  const cookie = login.response.headers
    .getSetCookie()
    .find((value) => value.startsWith("access_token="))
    .split(";")[0];
  const claims = JSON.parse(Buffer.from(cookie.split(".")[1], "base64url").toString());
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: randomUUID(),
      role: "STAFF",
      tokenType: "access",
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const staff = `access_token=${unsigned}.${createHmac("sha256", credentials.JWT_SECRET).update(unsigned).digest("base64url")}`;

  const listing = await request(products, "/loan-products");

  assert.ok(listing.body.data.some(({ id }) => id === product.id));
  const input = {
    productId: product.id,
    requestedAmount: 1000000,
    termMonths: 2,
    purpose: "Home repairs",
  };
  const created = await request(applications, "/loan-applications", {
    method: "POST",
    body: input,
    cookie,
    status: 201,
  });
  const path = `/loan-applications/${created.body.id}`;
  const applicantInfo = {
    fullName: account.fullName,
    phone: account.phone,
    email: account.email,
    dateOfBirth: "1995-01-01",
    identityNumber: "012345678901",
    identityIssuedDate: "2020-01-01",
    identityExpiryDate: "2099-01-01",
  };

  await request(applications, path, {
    method: "PATCH",
    cookie,
    body: {
      requestedAmount: input.requestedAmount,
      termMonths: input.termMonths,
      purpose: input.purpose,
      applicantInfo,
      currentAddress: {
        addressLine: "1 Test Street",
        ward: "Test ward",
        district: "Test district",
        province: "Ho Chi Minh City",
      },
      employmentInfo: {
        employmentType: "SALARIED",
        employerName: "Test employer",
        jobTitle: "Engineer",
        employmentStartDate: "2020-01-01",
      },
      financialInfo: { monthlyIncome: 20000000, otherMonthlyIncome: 0 },
      disbursementAccount: { accountNumber: "1234567890", accountHolderName: "NGUYEN VAN A" },
      contacts: [
        { fullName: "Contact One", relationship: "Sibling", phone: "0900000001" },
        { fullName: "Contact Two", relationship: "Parent", phone: "0900000002" },
      ],
    },
  });

  for (const type of ["ID_FRONT", "ID_BACK"]) {
    const form = new FormData();

    form.set("type", type);
    form.set("file", new Blob([new Uint8Array(8)], { type: "image/png" }), "identity.png");
    await request(applications, `${path}/documents`, {
      method: "POST",
      body: form,
      cookie,
      status: 201,
    });
  }

  const verification = await request(applications, `${path}/identity-verifications`, {
    method: "POST",
    cookie,
    status: 201,
    body: {
      identityNumber: applicantInfo.identityNumber,
      fullName: applicantInfo.fullName,
      dateOfBirth: applicantInfo.dateOfBirth,
      identityExpiryDate: applicantInfo.identityExpiryDate,
    },
  });

  assert.equal(verification.body.status, "PASSED");
  assert.equal(
    (await request(applications, `${path}/disbursement-account/verify`, { method: "POST", cookie }))
      .body.status,
    "VERIFIED",
  );
  const readiness = await request(applications, `${path}/validation`, { cookie });

  assert.equal(readiness.body.valid, true, JSON.stringify(readiness.body));
  const contract = await request(applications, `${path}/contract`, {
    method: "POST",
    cookie,
    status: 201,
  });
  const submission = await request(applications, `${path}/submit`, {
    method: "POST",
    cookie,
    body: { contractVersion: contract.body.version, confirm: true },
  });

  assert.equal(submission.body.applicationStatus, "SUBMITTED");
  const staffPath = `/staff/loan-applications/${created.body.id}`;
  const review = await request(applications, `${staffPath}/review`, { cookie: staff });

  assert.equal(review.body.application.financialInfo.monthlyIncome, 20000000);
  assert.equal(review.body.contract.status, "CUSTOMER_SIGNED");
  await request(applications, `${staffPath}/decision`, {
    method: "POST",
    cookie: staff,
    body: { status: "APPROVED" },
  });
  const disbursementKey = randomUUID();
  const disbursement = await request(applications, `${staffPath}/disbursement`, {
    method: "POST",
    cookie: staff,
    key: disbursementKey,
  });

  assert.equal(disbursement.body.status, "SUCCEEDED");
  assert.deepEqual(
    (
      await request(applications, `${staffPath}/disbursement`, {
        method: "POST",
        cookie: staff,
        key: disbursementKey,
      })
    ).body,
    disbursement.body,
  );
  assert.equal(
    (
      await request(applications, "/loan-applications", {
        method: "POST",
        body: input,
        cookie,
        status: 409,
      })
    ).body.code,
    "ACTIVE_LOAN_EXISTS",
  );
  const loanPath = `/loans/${disbursement.body.loanId}`;
  const schedule = await request(repayment, `${loanPath}/repayment-schedule`, { cookie });

  assert.equal(schedule.body.items.length, 2);

  for (const installment of schedule.body.items) {
    const key = randomUUID();
    const options = {
      method: "POST",
      cookie,
      key,
      body: { installmentId: installment.id, amount: installment.outstandingAmount },
    };
    const paid = await request(repayment, `${loanPath}/payments`, options);

    assert.deepEqual((await request(repayment, `${loanPath}/payments`, options)).body, paid.body);
  }

  const closed = await request(repayment, loanPath, { cookie });

  assert.equal(closed.body.customerId, claims.sub);
  assert.equal(closed.body.status, "CLOSED");
  assert.equal(closed.body.outstandingAmount, 0);
  assert.ok(closed.body.closedAt);
  assert.equal((await request(repayment, `${loanPath}/payments`, { cookie })).body.total, 2);
  await request(applications, "/loan-applications", {
    method: "POST",
    body: input,
    cookie,
    status: 201,
  });
  console.log(
    "PASS workflow: register/login → application/documents/verification → signed contract/submission → staff review/approval → disbursement/replay → payments/closure → repeat borrowing",
  );
}
