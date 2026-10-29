import "reflect-metadata";

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import test from "node:test";

import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { PrismaPg } from "@prisma/adapter-pg";

import { AppModule } from "../dist/app.module.js";
import { PrismaClient } from "../dist/generated/prisma/client.js";
import { PrismaService } from "../dist/modules/prisma/prisma.service.js";
import { memoryPrisma } from "./memory-prisma.mjs";

async function availablePort() {
  const server = createServer();

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();

  await new Promise((resolve) => server.close(resolve));

  return port;
}

const productId = (number = 1) => `00000000-0000-4000-8000-00000000000${number}`;
const input = (extra = {}) => ({
  productId: productId(),
  requestedAmount: 2000000,
  termMonths: 6,
  purpose: "Home repairs",
  ...extra,
});
const contacts = (suffix = "1") => [
  { fullName: "Contact One", relationship: "Sibling", phone: `090000001${suffix}` },
  { fullName: "Contact Two", relationship: "Friend", phone: `090000002${suffix}` },
];

// Current HTTP validation requires all root and nested update fields.
const updateInput = (extra = {}) => ({
  requestedAmount: 2000000,
  termMonths: 6,
  purpose: "Home repairs",
  applicantInfo: {
    fullName: "Borrower",
    dateOfBirth: "1990-01-02",
    identityNumber: "123456789012",
    identityIssuedDate: "2020-01-01",
    identityExpiryDate: "2090-01-01",
    email: "borrower@example.com",
    phone: "0900000000",
  },
  currentAddress: {
    addressLine: "123 Test Street",
    ward: "Ward",
    district: "District",
    province: "Province",
  },
  employmentInfo: {
    employmentType: "SALARIED",
    employerName: "Test Company",
    jobTitle: "Developer",
    employmentStartDate: "2020-01-01",
  },
  financialInfo: { monthlyIncome: 8000000, otherMonthlyIncome: 0 },
  disbursementAccount: { accountNumber: "123456", accountHolderName: "BORROWER" },
  contacts: contacts(),
  ...extra,
});

test("loan application HTTP contract", async (t) => {
  const databaseUrl = process.env.TEST_DATABASE_URL;

  if (
    databaseUrl &&
    process.env.CI !== "true" &&
    !new URL(databaseUrl).pathname.endsWith("_test")
  ) {
    throw new Error(
      "TEST_DATABASE_URL must name a dedicated *_test database or disposable CI database",
    );
  }
  const prisma = databaseUrl
    ? new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    : memoryPrisma();
  const storageRoot = await mkdtemp(join(tmpdir(), "loan-applications-test-"));

  process.env.JWT_SECRET = randomBytes(32).toString("hex");
  process.env.PRODUCT_INTERNAL_TOKEN = "synthetic-service-token";
  process.env.DOCUMENT_STORAGE_PATH = storageRoot;
  let productServer;
  let productExited;

  if (!process.env.PRODUCT_SIMULATION_URL) {
    const port = await availablePort();

    productServer = spawn(process.execPath, ["test/fixtures/loan-product.cjs"], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, PORT: String(port) },
      stdio: "pipe",
    });
    productExited = once(productServer, "exit");
    process.env.LOAN_PRODUCT_SERVICE_URL = `http://127.0.0.1:${port}`;
    let ready = false;

    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const response = await fetch(
          `${process.env.LOAN_PRODUCT_SERVICE_URL}/api/v1/internal/loan-products/${productId()}`,
          { headers: { "X-Internal-Service-Token": process.env.PRODUCT_INTERNAL_TOKEN } },
        );

        ready = response.ok;

        if (ready) {
          break;
        }
      } catch {
        /* wait for fixture */
      }
      await setTimeout(50);
    }
    assert.ok(ready, "Product fixture did not start");
  } else {
    process.env.LOAN_PRODUCT_SERVICE_URL = process.env.PRODUCT_SIMULATION_URL;
  }

  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();
  const app = module.createNestApplication({ logger: false });

  app.setGlobalPrefix("api/v1");
  await app.listen(0, "127.0.0.1");
  const base = `${await app.getUrl()}/api/v1/loan-applications`;
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  const customerIds = [];

  function cookie(id = randomUUID(), claims = {}) {
    customerIds.push(id);

    const payload = { sub: id, role: "CUSTOMER", tokenType: "access", ...claims };
    const options = {
      ...(claims.exp === undefined ? { expiresIn: "15m" } : {}),
      algorithm: "HS256",
    };
    const token = jwt.sign(payload, options);

    return `access_token=${token}`;
  }

  async function request(method, path = "", body, auth) {
    let requestBody = body;

    if (body !== undefined && !(body instanceof FormData)) {
      requestBody = JSON.stringify(body);
    }

    return fetch(`${base}${path}`, {
      method,
      headers: {
        ...(auth ? { cookie: auth } : {}),
        ...(body instanceof FormData ? {} : { "content-type": "application/json" }),
      },
      body: requestBody,
    });
  }
  async function create(extra = {}) {
    const auth = cookie();
    const response = await request("POST", "", input(extra), auth);

    assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));

    return { auth, application: await response.json() };
  }
  async function expectCode(response, status, code) {
    assert.equal(response.status, status, JSON.stringify(await response.clone().json()));
    const body = await response.json();

    assert.equal(body.code, code);
    assert.ok(Array.isArray(body.details));
  }
  function multipart(type = "ID_FRONT", mime = "image/png", size = 8) {
    const body = new FormData();

    body.set("type", type);
    body.set("file", new Blob([new Uint8Array(size)], { type: mime }), "identity.png");

    return body;
  }

  try {
    await t.test("creates an incomplete DRAFT with the exact public shape", async () => {
      const { application } = await create();

      assert.equal(application.status, "DRAFT");
      assert.equal(application.requestedAmount, 2000000);
      assert.equal(application.applicantInfo.fullName, null);
      assert.equal(application.disbursementAccount.verificationStatus, "UNVERIFIED");
      assert.deepEqual(application.contacts, []);
      assert.deepEqual(application.documents, []);
      assert.ok(application.applicationNumber.startsWith("LA-"));
      assert.deepEqual(
        Object.keys(application).sort(),
        [
          "id",
          "applicationNumber",
          "customerId",
          "productId",
          "status",
          "requestedAmount",
          "termMonths",
          "purpose",
          "applicantInfo",
          "currentAddress",
          "employmentInfo",
          "financialInfo",
          "contacts",
          "disbursementAccount",
          "documents",
          "createdAt",
          "updatedAt",
        ].sort(),
      );
    });
    await t.test(
      "authenticates the access cookie and rejects forged, expired, refresh and noncustomer tokens",
      async () => {
        for (const auth of [
          undefined,
          "access_token=forged",
          cookie(randomUUID(), { tokenType: "refresh" }),
          cookie(randomUUID(), { exp: 1 }),
        ]) {
          await expectCode(await request("POST", "", input(), auth), 401, "UNAUTHORIZED");
        }
        await expectCode(
          await request("POST", "", input(), cookie(randomUUID(), { role: "STAFF" })),
          403,
          "FORBIDDEN",
        );
        await expectCode(
          await request("POST", "", input({ customerId: randomUUID() }), cookie()),
          400,
          "VALIDATION_ERROR",
        );
      },
    );
    await t.test("checks product existence, activity, terms and upstream failure", async () => {
      for (const [extra, status, code] of [
        [{ productId: productId(2) }, 409, "PRODUCT_INACTIVE"],
        [{ productId: productId(3) }, 404, "PRODUCT_NOT_FOUND"],
        [{ productId: productId(5) }, 503, "PRODUCT_SERVICE_UNAVAILABLE"],
        [{ requestedAmount: 100 }, 400, "AMOUNT_OUT_OF_RANGE"],
        [{ termMonths: 7 }, 400, "TERM_NOT_ALLOWED"],
        [{ requestedAmount: 2.5 }, 400, "VALIDATION_ERROR"],
        [{ termMonths: null }, 400, "VALIDATION_ERROR"],
      ]) {
        await expectCode(await request("POST", "", input(extra), cookie()), status, code);
      }
    });
    await t.test("serializes concurrent creations for one customer", async () => {
      const auth = cookie();
      const results = await Promise.all([
        request("POST", "", input(), auth),
        request("POST", "", input(), auth),
      ]);

      assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
      await expectCode(
        results.find((result) => result.status === 409),
        409,
        "ACTIVE_APPLICATION_EXISTS",
      );
    });
    await t.test("enforces ownership, UUIDs, existence and DRAFT state", async () => {
      const { auth, application } = await create();

      await expectCode(
        await request("PATCH", `/${application.id}`, updateInput(), cookie()),
        403,
        "FORBIDDEN",
      );
      await expectCode(
        await request("PATCH", "/invalid", updateInput(), auth),
        400,
        "VALIDATION_ERROR",
      );
      await expectCode(
        await request("PATCH", `/${randomUUID()}`, updateInput(), auth),
        404,
        "APPLICATION_NOT_FOUND",
      );
      await prisma.loanApplication.update({
        where: { id: application.id },
        data: { status: "SUBMITTED" },
      });
      await expectCode(
        await request("PATCH", `/${application.id}`, updateInput(), auth),
        409,
        "APPLICATION_NOT_EDITABLE",
      );
      await expectCode(
        await request("POST", `/${application.id}/documents`, multipart(), auth),
        409,
        "APPLICATION_NOT_EDITABLE",
      );
    });
    await t.test(
      "accepts complete updates and resets verification only when account fields change",
      async () => {
        const { auth, application } = await create();
        const path = `/${application.id}`;
        let response = await request("PATCH", path, updateInput(), auth);

        assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
        let updated = await response.json();

        assert.deepEqual(updated.applicantInfo, updateInput().applicantInfo);
        assert.deepEqual(updated.currentAddress, updateInput().currentAddress);
        assert.deepEqual(updated.employmentInfo, updateInput().employmentInfo);
        assert.deepEqual(updated.financialInfo, updateInput().financialInfo);
        await prisma.loanApplication.update({
          where: { id: application.id },
          data: { accountVerificationStatus: "VERIFIED" },
        });
        response = await request("PATCH", path, updateInput({ purpose: "Education" }), auth);
        assert.equal(response.status, 200);
        updated = await response.json();
        assert.equal(updated.purpose, "Education");
        assert.equal(updated.disbursementAccount.verificationStatus, "VERIFIED");

        response = await request(
          "PATCH",
          path,
          updateInput({
            disbursementAccount: { accountNumber: "654321", accountHolderName: "BORROWER" },
          }),
          auth,
        );
        assert.equal(response.status, 200);
        updated = await response.json();
        assert.equal(updated.disbursementAccount.accountNumber, "654321");
        assert.equal(updated.disbursementAccount.accountHolderName, "BORROWER");
        assert.equal(updated.disbursementAccount.verificationStatus, "UNVERIFIED");

        for (const body of [
          {},
          { purpose: "Incomplete update" },
          updateInput({ productId: productId(2) }),
          updateInput({ requestedAmount: null }),
          updateInput({ applicantInfo: null }),
          updateInput({
            applicantInfo: { ...updateInput().applicantInfo, dateOfBirth: "2026-02-30" },
          }),
          updateInput({
            applicantInfo: { ...updateInput().applicantInfo, identityExpiryDate: "2025-02-29" },
          }),
          updateInput({
            applicantInfo: { ...updateInput().applicantInfo, identityExpiryDate: "2019-12-31" },
          }),
          updateInput({
            applicantInfo: {
              ...updateInput().applicantInfo,
              identityExpiryDate: "2030-01-01T00:00:00Z",
            },
          }),
          updateInput({ financialInfo: { monthlyIncome: -1, otherMonthlyIncome: 0 } }),
        ]) {
          await expectCode(await request("PATCH", path, body, auth), 400, "VALIDATION_ERROR");
        }

        // Verify omitted root fields, plus omitted and null nested values.
        for (const field of Object.keys(updateInput())) {
          const omitted = updateInput();

          delete omitted[field];
          await expectCode(await request("PATCH", path, omitted, auth), 400, "VALIDATION_ERROR");
        }

        for (const [group, values] of Object.entries(updateInput())) {
          if (typeof values !== "object" || Array.isArray(values)) {
            continue;
          }

          for (const field of Object.keys(values)) {
            const omitted = { ...values };

            delete omitted[field];
            await expectCode(
              await request("PATCH", path, updateInput({ [group]: omitted }), auth),
              400,
              "VALIDATION_ERROR",
            );
            await expectCode(
              await request(
                "PATCH",
                path,
                updateInput({ [group]: { ...values, [field]: null } }),
                auth,
              ),
              400,
              "VALIDATION_ERROR",
            );
          }
        }
        await expectCode(
          await request("PATCH", path, updateInput({ requestedAmount: 9999999 }), auth),
          400,
          "AMOUNT_OUT_OF_RANGE",
        );
        await expectCode(
          await request("PATCH", path, updateInput({ termMonths: 99 }), auth),
          400,
          "TERM_NOT_ALLOWED",
        );
      },
    );
    await t.test(
      "replaces exactly two distinct contacts and rejects omitted contacts",
      async () => {
        const { auth, application } = await create();
        const path = `/${application.id}`;

        for (const list of [[], [contacts()[0]], [contacts()[0], contacts()[0]]]) {
          await expectCode(
            await request("PATCH", path, updateInput({ contacts: list }), auth),
            400,
            "VALIDATION_ERROR",
          );
        }
        assert.equal((await request("PATCH", path, updateInput(), auth)).status, 200);
        const replaced = await request(
          "PATCH",
          path,
          updateInput({ contacts: contacts("2") }),
          auth,
        );

        assert.equal(replaced.status, 200);
        assert.deepEqual((await replaced.json()).contacts, contacts("2"));

        const omitted = updateInput({ purpose: "Updated purpose" });

        delete omitted.contacts;
        await expectCode(await request("PATCH", path, omitted, auth), 400, "VALIDATION_ERROR");
        const unchanged = await prisma.loanApplication.findUnique({
          where: { id: application.id },
          include: { contacts: { orderBy: { position: "asc" } } },
        });

        assert.deepEqual(
          unchanged.contacts.map(({ fullName, relationship, phone }) => ({
            fullName,
            relationship,
            phone,
          })),
          contacts("2"),
        );
      },
    );
    await t.test("validates upload type, MIME, size, file presence and ownership", async () => {
      const { auth, application } = await create({ productId: productId(4) });
      const path = `/${application.id}/documents`;

      await expectCode(await request("POST", path, multipart(), undefined), 401, "UNAUTHORIZED");
      await expectCode(await request("POST", path, multipart(), cookie()), 403, "FORBIDDEN");
      await expectCode(
        await request("POST", path, multipart("OTHER"), auth),
        400,
        "VALIDATION_ERROR",
      );
      await expectCode(
        await request("POST", path, multipart("ID_BACK"), auth),
        422,
        "DOCUMENT_TYPE_NOT_REQUIRED",
      );
      await expectCode(
        await request("POST", path, multipart("ID_FRONT", "text/plain"), auth),
        415,
        "UNSUPPORTED_FILE_TYPE",
      );
      await expectCode(
        await request("POST", path, multipart("ID_FRONT", "image/png", 10 * 1024 * 1024 + 1), auth),
        413,
        "FILE_TOO_LARGE",
      );
      const missing = new FormData();

      missing.set("type", "ID_FRONT");
      await expectCode(await request("POST", path, missing, auth), 400, "VALIDATION_ERROR");
    });
    await t.test(
      "uploads, replaces and concurrently replaces documents while preserving history and files",
      async () => {
        const { auth, application } = await create();
        const path = `/${application.id}/documents`;
        const first = await request("POST", path, multipart(), auth);

        assert.equal(first.status, 201, JSON.stringify(await first.clone().json()));
        const firstBody = await first.json();

        assert.deepEqual(
          Object.keys(firstBody).sort(),
          ["id", "type", "fileName", "contentType", "size", "uploadedAt"].sort(),
        );
        const second = await request("POST", path, multipart("ID_FRONT", "application/pdf"), auth);

        assert.equal(second.status, 201);
        assert.notEqual((await second.json()).id, firstBody.id);
        const concurrent = await Promise.all([
          request("POST", path, multipart(), auth),
          request("POST", path, multipart(), auth),
        ]);

        for (const response of concurrent) {
          assert.equal(response.status, 201);
        }
        const history = await prisma.applicationDocument.findMany({
          where: { applicationId: application.id },
        });

        assert.equal(history.length, 4);
        assert.equal(history.filter((document) => document.isCurrent).length, 1);
        assert.equal(history.find((document) => document.id === firstBody.id).isCurrent, false);
        assert.equal((await readdir(join(storageRoot, application.id))).length, 4);
        const current = await request(
          "PATCH",
          `/${application.id}`,
          updateInput({ purpose: "Review current document" }),
          auth,
        );

        assert.equal(current.status, 200);
        assert.equal((await current.json()).documents.length, 1);
      },
    );
    await t.test(
      "cleans up confirmed metadata rollback and retains files after ambiguous commits",
      { skip: Boolean(databaseUrl) },
      async () => {
        const { auth, application } = await create();
        const path = `/${application.id}/documents`;

        assert.equal((await request("POST", path, multipart(), auth)).status, 201);
        const originalCreate = prisma.applicationDocument.create;

        prisma.applicationDocument.create = async () => {
          throw new Error("Injected private database failure");
        };

        try {
          await expectCode(
            await request("POST", path, multipart(), auth),
            500,
            "INTERNAL_SERVER_ERROR",
          );
          assert.equal((await readdir(join(storageRoot, application.id))).length, 1);
          const history = await prisma.applicationDocument.findMany({
            where: { applicationId: application.id },
          });

          assert.equal(history.length, 1);
          assert.equal(history[0].isCurrent, true);
        } finally {
          prisma.applicationDocument.create = originalCreate;
        }

        const originalTransaction = prisma.$transaction;

        prisma.$transaction = async (work) => {
          await originalTransaction(work);
          throw new Error("Injected lost commit acknowledgement");
        };

        try {
          await expectCode(
            await request("POST", path, multipart(), auth),
            500,
            "INTERNAL_SERVER_ERROR",
          );
          assert.equal((await readdir(join(storageRoot, application.id))).length, 2);
          const history = await prisma.applicationDocument.findMany({
            where: { applicationId: application.id },
          });

          assert.equal(history.length, 2);
          assert.equal(history.filter((document) => document.isCurrent).length, 1);
        } finally {
          prisma.$transaction = originalTransaction;
        }
      },
    );
    await t.test(
      "database constraints independently reject multiple current versions and active applications",
      { skip: !databaseUrl },
      async () => {
        const { application } = await create();

        await assert.rejects(
          prisma.loanApplication.create({
            data: {
              customerId: application.customerId,
              productId: application.productId,
              applicationNumber: randomUUID(),
              requestedAmount: 2000000n,
              termMonths: 6,
              purpose: "duplicate",
            },
          }),
          (error) => error.code === "P2002",
        );
        const data = {
          applicationId: application.id,
          type: "ID_FRONT",
          fileName: "test.png",
          contentType: "image/png",
          size: 8,
          storageKey: randomUUID(),
        };

        await prisma.applicationDocument.create({ data });
        await assert.rejects(
          prisma.applicationDocument.create({ data: { ...data, storageKey: randomUUID() } }),
          (error) => error.code === "P2002",
        );
      },
    );
  } finally {
    await app.close();

    if (databaseUrl) {
      const where = { application: { customerId: { in: customerIds } } };

      await prisma.applicationDocument.deleteMany({ where });
      await prisma.applicationContact.deleteMany({ where });
      await prisma.loanApplication.deleteMany({ where: { customerId: { in: customerIds } } });
      await prisma.$disconnect();
    }

    if (productServer) {
      productServer.kill();
      await productExited;
    }
    assert.equal(dirname(storageRoot), resolve(tmpdir()));
    await rm(storageRoot, { recursive: true, force: true });
  }
});
